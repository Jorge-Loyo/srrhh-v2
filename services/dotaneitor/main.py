"""
Dotaneitor — Microservicio FastAPI
Puerto: 5001
"""
import asyncio
import io
import os
import shutil
import uuid
from pathlib import Path
from threading import Thread
from time import time

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, text

# ── Módulos de lógica de negocio ──────────────────────────────────────────────
from normalizador_cargos import NormalizadorCargos
from especialidades import (
    ConsolidadorEspecialidades,
    completar_especialidad,
    filas_especialidad_sin_puesto,
    limpiar_especialidad_indebida,
    resumen_cobertura,
)
from especialidad_por_agrupador import (
    completar_especialidad_por_agrupador,
    sin_tilde,
    sin_tilde_mayuscula,
)

import sys
sys.path.insert(0, str(Path(__file__).parent))
from Dotaneitor import DotacionAutomation, COLUMNAS_NUCLEO_COMPLETITUD, COLUMNAS_MAYUSCULA_FORZADA  # noqa: E402

# ── Config ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
TMP_DIR  = BASE_DIR / 'tmp'
TMP_DIR.mkdir(exist_ok=True)

load_dotenv(BASE_DIR.parent / '.env.local')
load_dotenv(BASE_DIR / '.env')

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise RuntimeError('DATABASE_URL no configurada')

# SQLAlchemy engine — pool pequeño, Dotaneitor no tiene carga concurrente alta
_engine = create_engine(DATABASE_URL, pool_size=2, max_overflow=2)

SESSION_TTL = 7200

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title='Dotaneitor', version='2.0')

CORS_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', '').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)

# ── Sesiones en memoria ───────────────────────────────────────────────────────
sessions: dict = {}

# ── Jobs asíncronos ───────────────────────────────────────────────────────────
JOBS_DIR = TMP_DIR / 'jobs'
JOBS_DIR.mkdir(exist_ok=True)


def _job_path(job_id: str) -> Path:
    return JOBS_DIR / f'{job_id}.json'


def _write_job(job_id: str, data: dict):
    import json as _json
    _job_path(job_id).write_text(_json.dumps(data, ensure_ascii=True, default=str), encoding='utf-8')


def _read_job(job_id: str) -> dict | None:
    import json as _json
    p = _job_path(job_id)
    if not p.exists():
        return None
    try:
        return _json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return None


def get_session(session_id: str) -> dict:
    s = sessions.get(session_id)
    if not s:
        folder = TMP_DIR / session_id
        xlsx_files = list(folder.glob('*.xlsx')) if folder.exists() else []
        if not xlsx_files:
            raise HTTPException(404, 'Sesión no encontrada')

        # Recuperación tras reinicio del contenedor (hallazgo #3 de
        # Doc/Dotaneitor_Analisis.md): sessions[] es en memoria y se pierde,
        # pero resultado.parquet (escrito por /procesar y /cruzar) sobrevive
        # en disco. Si existe, se reconstruye el objeto automation con ese
        # DataFrame en vez de forzar a repetir /procesar (el paso caro, hasta
        # 48k filas). No se puede distinguir desde el parquet solo si ya
        # pasó por /cruzar también (ambos pasos escriben el mismo archivo) —
        # se recupera como solo-procesado a propósito: /cruzar es idempotente
        # (nunca pisa un valor ya cargado), así que repetirlo de más es
        # inofensivo, mientras que asumir cruzado=True de más podría dar por
        # completa una especialidad que en realidad nunca se cruzó.
        resultado_df = _load_df(session_id)
        automation = None
        if resultado_df is not None:
            automation = DotacionAutomationBD()
            automation.resultado_df = resultado_df

        s = {
            'automation':  automation,
            'normalizado': False,
            'procesado':   automation is not None,
            'cruzado':     False,
            'cargos_path': str(xlsx_files[0]),
            'last_access': time(),
        }
        sessions[session_id] = s
    else:
        s['last_access'] = time()
    return s


# ── Subclase: lee tablas de referencia desde Postgres ─────────────────────────
class DotacionAutomationBD(DotacionAutomation):
    """Igual que DotacionAutomation pero cargar_archivos() lee desde Postgres."""

    def cargar_archivos(self, ruta_cargos, _ruta_ignorada=None):
        try:
            self.cargos_df = pd.read_excel(
                ruta_cargos, sheet_name='Sheet1',
                dtype={'NUM_DOC': str, 'CODIGO DE REGISTRO': str},
            )
        except FileNotFoundError:
            return False, f'No se encontró el archivo: {ruta_cargos}'
        except PermissionError:
            return False, 'El archivo está abierto en otro programa.'
        except ValueError as e:
            return False, f"El archivo no tiene la hoja 'Sheet1': {e}"
        except Exception as e:
            return False, f'Error al leer Cargos_Salud: {e}'

        try:
            with _engine.connect() as conn:
                self.siglas_df = pd.read_sql(text("""
                    SELECT sigla                AS "Sigla",
                           universo_totalizador AS "UNIVERSO TOTALIZADOR",
                           tipo                 AS "Tipo de Hospital / Sigla",
                           monovalencia         AS "Monovalencia"
                    FROM hospitales WHERE activo = true
                """), conn)

                self.agrupador_df = pd.read_sql(text("""
                    SELECT cruce      AS "CRUCE",
                           escalafon  AS "ESCALAFON",
                           lit_puesto AS "LIT_PUESTO",
                           agrupador  AS "AGRUPADOR"
                    FROM ref_agrupadores WHERE activo = true
                """), conn)

                self.unificador_df = pd.read_sql(text("""
                    SELECT cruce       AS "Cruce",
                           lit_cod_reg AS "LIT_COD_REG",
                           lit_puesto  AS "LIT_PUESTO",
                           unificador  AS "UNIFICADOR DE PUESTO"
                    FROM ref_unificadores_puesto WHERE activo = true
                """), conn)
        except Exception as e:
            return False, f'Error al leer tablas de referencia desde Postgres: {e}'

        return True, 'Archivos cargados correctamente'


# ── Subclase: ConsolidadorEspecialidades que lee desde Postgres ───────────────
class ConsolidadorEspecialidadesBD(ConsolidadorEspecialidades):
    """Sobreescribe cargar() para leer ref_especialidades_cuil desde Postgres."""

    TIPO_A_COD_REG = {'cph': '37', 'suplentes': '23', 'residentes': '24'}

    def cargar(self, _ruta_ignorada=None):
        from especialidades import _resolver_especialidad_unica, normalizar_texto_especialidad

        self.lookups = {}
        self.reporte = {}

        with _engine.connect() as conn:
            df_all = pd.read_sql(text("""
                SELECT tipo,
                       cuil,
                       cuil_y_rol  AS "Cuil y Rol",
                       especialidad AS "ESPECIALIDAD UNIF."
                FROM ref_especialidades_cuil WHERE activo = true
            """), conn)

        if df_all.empty:
            return

        df_all['ESPECIALIDAD UNIF.'] = df_all['ESPECIALIDAD UNIF.'].apply(normalizar_texto_especialidad)
        df_all['CUIL'] = df_all['cuil'].astype(str)

        for tipo, cod_reg in self.TIPO_A_COD_REG.items():
            sub = df_all[df_all['tipo'] == tipo].copy()
            filas_antes = len(sub)
            sub = sub.drop_duplicates(subset='Cuil y Rol', keep='last')
            lookup = sub.groupby('CUIL')['ESPECIALIDAD UNIF.'].apply(
                _resolver_especialidad_unica
            ).to_dict()
            self.lookups[cod_reg] = lookup
            ambiguos = sub.groupby('CUIL')['ESPECIALIDAD UNIF.'].nunique()
            self.reporte[f'ESPECIALIDADES {tipo.upper()}'] = {
                'cuiles': len(lookup),
                'filas_duplicadas_removidas': filas_antes - len(sub),
                'cuiles_con_varias_especialidades': int((ambiguos > 1).sum()),
            }


# ── Helpers ───────────────────────────────────────────────────────────────────
def _cruzar_especialidades(automation: DotacionAutomationBD) -> list[str]:
    logs = []

    consolidador = ConsolidadorEspecialidadesBD()
    consolidador.cargar()

    df = automation.resultado_df.copy()
    from especialidades import limpiar_cuil
    valores = list(df['ESPECIALIDAD'])
    completados = 0
    for i, (val, cuil, cod_reg) in enumerate(
        zip(df['ESPECIALIDAD'], df['CUIL'], df['CODIGO DE REGISTRO'])
    ):
        if pd.notna(val) and str(val).strip():
            continue
        esp = consolidador.buscar_especialidad(limpiar_cuil(cuil), cod_reg)
        if esp:
            valores[i] = esp
            completados += 1
    df['ESPECIALIDAD'] = valores

    for linea in consolidador.generar_lineas_reporte():
        logs.append({'text': linea, 'type': 'info'})
    logs.append({'text': f'✓ Huecos completados por CUIL: {completados}', 'type': 'success'})

    logs.append({'text': 'Completando ESPECIALIDAD por AGRUPADOR...', 'type': 'info'})
    df, resumen, detalle_sin_resolver = completar_especialidad_por_agrupador(df)
    logs.append({
        'text': f"✓ Completados por AGRUPADOR: {resumen['cuil'] + resumen['puesto']} "
                f"({resumen['cuil']} por CUIL, {resumen['puesto']} por puesto)",
        'type': 'success',
    })

    automation.resultado_df = automation._forzar_mayusculas(df)

    for linea in resumen_cobertura(
        automation.resultado_df,
        columna_especialidad='ESPECIALIDAD',
        columna_cod_reg='CODIGO DE REGISTRO',
    ):
        logs.append({'text': linea, 'type': 'info'})

    automation.detalle_calidad[
        'ESPECIALIDAD no derivable (AGRUPADOR Medico/No medico/Residente, sin dato suficiente)'
    ] = detalle_sin_resolver

    detalle_sin_puesto = filas_especialidad_sin_puesto(automation.resultado_df).rename(
        columns={'ESPECIALIDAD': 'VALOR'}
    )
    automation.detalle_calidad['ESPECIALIDAD sin LITERAL PUESTO (revisar manualmente)'] = detalle_sin_puesto

    if resumen['sin_resolver']:
        logs.append({
            'text': f"[!] {resumen['sin_resolver']} fila(s) sin especialidad derivable — ver reporte de calidad",
            'type': 'warning',
        })
    if len(detalle_sin_puesto):
        logs.append({
            'text': f"[!] {len(detalle_sin_puesto)} fila(s) con ESPECIALIDAD pero sin LITERAL PUESTO",
            'type': 'warning',
        })

    return logs


def _df_to_excel_bytes(df: pd.DataFrame, sheet_name: str = 'Hoja1') -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as w:
        df.to_excel(w, index=False, sheet_name=sheet_name)
    return buf.getvalue()


# ── Cleanup de sesiones viejas ────────────────────────────────────────────────
def _cleanup_loop():
    while True:
        import time as _time
        _time.sleep(1800)
        cutoff = time() - SESSION_TTL
        to_del = [sid for sid, s in sessions.items() if s['last_access'] < cutoff]
        for sid in to_del:
            _remove_session(sid)


def _remove_session(session_id: str):
    sessions.pop(session_id, None)
    folder = TMP_DIR / session_id
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)


def _save_df(session_id: str, df: pd.DataFrame):
    path = TMP_DIR / session_id / 'resultado.parquet'
    df = df.copy()
    for col in df.select_dtypes(include='object').columns:
        df[col] = df[col].where(df[col].isna(), df[col].astype(str))
    df.to_parquet(path, index=False)


def _load_df(session_id: str) -> pd.DataFrame | None:
    path = TMP_DIR / session_id / 'resultado.parquet'
    if not path.exists():
        return None
    try:
        return pd.read_parquet(path)
    except Exception:
        return None


Thread(target=_cleanup_loop, daemon=True).start()


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'dotaneitor'}


@app.post('/session')
def create_session():
    sid = str(uuid.uuid4())
    sessions[sid] = {
        'automation':  None,
        'normalizado': False,
        'procesado':   False,
        'cruzado':     False,
        'cargos_path': None,
        'last_access': time(),
    }
    (TMP_DIR / sid).mkdir(exist_ok=True)
    return {'session_id': sid}


@app.post('/upload-cargos')
async def upload_cargos(session_id: str = Form(...), file: UploadFile = File(...)):
    s = get_session(session_id)
    folder = TMP_DIR / session_id
    folder.mkdir(exist_ok=True)

    dest = folder / file.filename
    dest.write_bytes(await file.read())

    try:
        df_full = pd.read_excel(dest, sheet_name='Sheet1')
        rows = len(df_full)
    except Exception:
        rows = None

    s['cargos_path'] = str(dest)
    s['normalizado'] = False
    s['procesado']   = False
    s['cruzado']     = False
    s['automation']  = None

    return {'filename': file.filename, 'rows': rows}


class SessionBody(BaseModel):
    session_id: str
    fecha_asignada: str | None = None


def _start_job(fn, *args) -> str:
    jid = str(uuid.uuid4())
    _write_job(jid, {'status': 'pending', 'result': None, 'error': None})

    def _worker():
        try:
            result = fn(*args)
            _write_job(jid, {'status': 'done', 'result': result, 'error': None})
        except Exception as e:
            import traceback
            _write_job(jid, {'status': 'error', 'result': None,
                             'error': str(e) + '\n' + traceback.format_exc()})

    Thread(target=_worker, daemon=True).start()
    return jid


@app.get('/job/{job_id}')
def poll_job(job_id: str):
    job = _read_job(job_id)
    if not job:
        raise HTTPException(404, 'Job no encontrado')
    import json as _json
    from fastapi.responses import Response
    return Response(
        content=_json.dumps(job, ensure_ascii=True, default=str),
        media_type='application/json',
    )


@app.post('/normalizar')
async def normalizar(body: SessionBody):
    s = get_session(body.session_id)
    if not s['cargos_path']:
        raise HTTPException(400, 'Primero subí el archivo Cargos_Salud')

    def _run():
        norm = NormalizadorCargos()
        df   = pd.read_excel(s['cargos_path'], sheet_name='Sheet1',
                             dtype={'NUM_DOC': str, 'CODIGO DE REGISTRO': str})
        df_n = norm.normalizar(df)
        with pd.ExcelWriter(s['cargos_path'], engine='openpyxl') as w:
            df_n.to_excel(w, index=False, sheet_name='Sheet1')
        s['normalizado'] = True
        logs = [{'text': '✓ Normalización completada', 'type': 'success'}]
        for l in norm.generar_lineas_reporte():
            logs.append({'text': l, 'type': 'info'})
        return {'logs': logs}

    return {'job_id': _start_job(_run)}


@app.post('/procesar')
async def procesar(body: SessionBody):
    s = get_session(body.session_id)
    if not s['cargos_path']:
        raise HTTPException(400, 'Primero subí el archivo Cargos_Salud')

    def _run():
        auto = DotacionAutomationBD()
        ok, msg = auto.cargar_archivos(s['cargos_path'])
        if not ok:
            raise RuntimeError(msg)
        ok, msg = auto.procesar()
        if not ok:
            raise RuntimeError(msg)
        s['automation'] = auto
        s['procesado']  = True
        s['cruzado']    = False
        _save_df(body.session_id, auto.resultado_df)
        logs = [{'text': f'✓ {len(auto.resultado_df)} registros procesados', 'type': 'success'}]
        for linea in auto.generar_lineas_reporte_calidad():
            t = 'warning' if linea.startswith('[!]') else 'info'
            logs.append({'text': linea, 'type': t})
        return {'logs': logs}

    return {'job_id': _start_job(_run)}


@app.post('/cruzar')
async def cruzar(body: SessionBody):
    s = get_session(body.session_id)
    if not s['procesado'] or not s['automation']:
        raise HTTPException(400, 'Primero procesá los datos')

    def _run():
        logs = _cruzar_especialidades(s['automation'])
        s['cruzado'] = True
        _save_df(body.session_id, s['automation'].resultado_df)
        return {'logs': logs}

    return {'job_id': _start_job(_run)}


@app.get('/preview')
def preview(
    session_id: str = Query(...),
    page:  int = Query(1,  ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    """Devuelve el DataFrame procesado paginado. Node lo usa para calcular el diff."""
    s = get_session(session_id)
    if s['automation'] is not None:
        df = s['automation'].resultado_df
    else:
        df = _load_df(session_id)
        if df is None:
            raise HTTPException(400, 'Sin datos procesados')
        s['procesado'] = True

    total = len(df)
    start = (page - 1) * limit
    chunk = df.iloc[start:start + limit]

    import math
    def _safe(v):
        if v is None: return None
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
        return v

    rows = [{k: _safe(v) for k, v in r.items()} for r in chunk.to_dict(orient='records')]
    return {'cols': list(df.columns), 'rows': rows, 'total': total, 'page': page, 'limit': limit}


@app.get('/descargar')
def descargar(session_id: str = Query(...)):
    s = get_session(session_id)
    if not s['procesado'] or s['automation'] is None:
        raise HTTPException(400, 'Sin datos para descargar')
    data = _df_to_excel_bytes(s['automation'].resultado_df, sheet_name='Dotacion')
    return StreamingResponse(
        io.BytesIO(data),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename="Dotacion_procesada.xlsx"'},
    )


@app.get('/reporte-calidad')
def reporte_calidad(session_id: str = Query(...)):
    s = get_session(session_id)
    if not s['procesado'] or s['automation'] is None:
        raise HTTPException(400, 'Sin datos procesados')

    auto = s['automation']
    buf  = io.BytesIO()

    filas_resumen, partes = [], []
    for problema, detalle in auto.detalle_calidad.items():
        n = len(detalle)
        v = detalle['VALOR'].nunique() if 'VALOR' in detalle.columns and n else 0
        filas_resumen.append({'Problema': problema, 'Filas afectadas': n, 'Valores distintos': v})
        if n:
            parte = detalle.copy()
            parte.insert(0, 'PROBLEMA', problema)
            partes.append(parte)

    resumen_df = pd.DataFrame(filas_resumen)
    detalle_df = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(
        columns=['PROBLEMA', 'CUIL Y ROL', 'AYN', 'VALOR']
    )
    comp_col, comp_fila = auto.calcular_completitud()

    with pd.ExcelWriter(buf, engine='openpyxl') as w:
        resumen_df.to_excel(w, index=False, sheet_name='Resumen')
        detalle_df.to_excel(w, index=False, sheet_name='Detalle')
        comp_col.to_excel(w,  index=False, sheet_name='Completitud por columna')
        comp_fila.to_excel(w, index=False, sheet_name='Completitud por fila')

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename="Reporte_calidad.xlsx"'},
    )


@app.post('/session/delete')
def delete_session(body: SessionBody):
    _remove_session(body.session_id)
    return {'ok': True}

