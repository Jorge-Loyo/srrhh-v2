"""
Dotaneitor — Microservicio FastAPI
Puerto: 5001
"""
import asyncio
import io
import os
import shutil
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from threading import Thread
from time import time

import mysql.connector
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# ── Módulos de lógica de negocio (copiados desde Automatización Dotación) ────
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

# ── Dotaneitor.py: módulo de lógica de negocio ─────────────────────────────────
# Ya no hace falta mockear tkinter: la clase GUI (DotacionGUI) se sacó de
# Dotaneitor.py en S2-1 (ver Doc/Dotaneitor_Analisis.md hallazgos #2/#9) — ese
# archivo es ahora solo lógica y no importa tkinter en absoluto.
import sys
sys.path.insert(0, str(Path(__file__).parent))

from Dotaneitor import DotacionAutomation, COLUMNAS_NUCLEO_COMPLETITUD, COLUMNAS_MAYUSCULA_FORZADA  # noqa: E402

# ── Config ────────────────────────────────────────────────────────────────────
BASE_DIR  = Path(__file__).parent
ENV_FILE  = BASE_DIR.parent / '.env.local'
TMP_DIR   = BASE_DIR / 'tmp'
TMP_DIR.mkdir(exist_ok=True)

load_dotenv(ENV_FILE)

DB_CFG = {
    'host':     os.getenv('DB_HOST', 'localhost'),
    'port':     int(os.getenv('DB_PORT', 3306)),
    'user':     os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
}

SESSION_TTL = 7200  # segundos (2 horas)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title='Dotaneitor', version='1.0')

# CORS: Node -> Python es server-to-server, CORS no aplica ahí (es un mecanismo
# de navegador). El único caso que esto restringe de verdad es que un browser
# llame a Dotaneitor directo, algo que la regla de arquitectura del README dice
# que nunca debería pasar ("el frontend nunca habla directamente con este
# servicio"). Antes era allow_origins=['*'] (hallazgo #8 de
# Doc/Dotaneitor_Analisis.md); ahora sale de env, vacío por default, mismo
# patrón que CORS_ORIGINS en apps/api.
CORS_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', '').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)

# ── Sesiones en memoria ───────────────────────────────────────────────────────
# { session_id: { automation, normalizado, procesado, cruzado, cargos_path, last_access } }
sessions: dict = {}

# ── Jobs asíncronos ───────────────────────────────────────────────────────────
# En memoria + persistidos en disco para sobrevivir reinicios de Render
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
        # Intentar recuperar sesión desde disco (sobrevive reinicios del servidor)
        folder = TMP_DIR / session_id
        xlsx_files = list(folder.glob('*.xlsx')) if folder.exists() else []
        if not xlsx_files:
            raise HTTPException(404, 'Sesión no encontrada')
        cargos_path = str(xlsx_files[0])
        s = {
            'automation':  None,
            'normalizado': False,
            'procesado':   False,
            'cruzado':     False,
            'cargos_path': cargos_path,
            'last_access': time(),
        }
        sessions[session_id] = s
    else:
        s['last_access'] = time()
    return s


def db_connect():
    return mysql.connector.connect(**DB_CFG)


# ── Subclase: lee tablas de referencia desde BD en vez del Excel ──────────────
class DotacionAutomationBD(DotacionAutomation):
    """Igual que DotacionAutomation pero cargar_archivos() lee la BD."""

    def cargar_archivos(self, ruta_cargos, _ruta_ignorada=None):
        # 1. Leer Cargos_Salud desde el archivo subido
        try:
            self.cargos_df = pd.read_excel(ruta_cargos, sheet_name='Sheet1',
                                           dtype={'NUM_DOC': str, 'CODIGO DE REGISTRO': str})
        except FileNotFoundError:
            return False, f'No se encontró el archivo: {ruta_cargos}'
        except PermissionError:
            return False, 'El archivo está abierto en otro programa.'
        except ValueError as e:
            return False, f"El archivo no tiene la hoja 'Sheet1': {e}"
        except Exception as e:
            return False, f'Error al leer Cargos_Salud: {e}'

        # 2. Leer tablas de referencia desde MySQL
        try:
            conn = db_connect()
            cur  = conn.cursor(dictionary=True)

            cur.execute("""
                SELECT sigla AS `Sigla`,
                       universo_totalizador   AS `UNIVERSO TOTALIZADOR`,
                       tipo_hospital_sigla    AS `Tipo de Hospital / Sigla`,
                       monovalencia           AS `Monovalencia`
                FROM siglas
            """)
            self.siglas_df = pd.DataFrame(cur.fetchall())

            cur.execute("""
                SELECT cruce      AS `CRUCE`,
                       escalafon  AS `ESCALAFON`,
                       lit_puesto AS `LIT_PUESTO`,
                       agrupador  AS `AGRUPADOR`
                FROM dot_agrupador WHERE activo = 1
            """)
            self.agrupador_df = pd.DataFrame(cur.fetchall())

            cur.execute("""
                SELECT cruce       AS `Cruce`,
                       lit_cod_reg AS `LIT_COD_REG`,
                       lit_puesto  AS `LIT_PUESTO`,
                       unificador  AS `UNIFICADOR DE PUESTO`
                FROM dot_unificador_puestos WHERE activo = 1
            """)
            self.unificador_df = pd.DataFrame(cur.fetchall())

            cur.close()
            conn.close()
        except Exception as e:
            return False, f'Error al leer tablas de referencia desde la BD: {e}'

        return True, 'Archivos cargados correctamente'


# ── Subclase: ConsolidadorEspecialidades que lee desde BD ─────────────────────
class ConsolidadorEspecialidadesBD(ConsolidadorEspecialidades):
    """Sobreescribe cargar() para leer dot_especialidades desde MySQL."""

    TIPO_A_COD_REG = {'cph': '37', 'suplentes': '23', 'residentes': '24'}

    def cargar(self, _ruta_ignorada=None):
        from especialidades import _resolver_especialidad_unica, normalizar_texto_especialidad

        self.lookups = {}
        self.reporte = {}

        conn = db_connect()
        cur  = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT tipo, cuil, cuil_y_rol AS `Cuil y Rol`,
                   especialidad AS `ESPECIALIDAD UNIF.`
            FROM dot_especialidades WHERE activo = 1
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        df_all = pd.DataFrame(rows)
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
    """Ejecuta el cruce de especialidades (paso 4) y devuelve líneas de log."""
    logs = []

    # Paso 1: cruce por CUIL desde BD
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

    # Paso 2: completar por AGRUPADOR (usa datos en memoria, sin archivos externos)
    logs.append({'text': 'Completando ESPECIALIDAD por AGRUPADOR...', 'type': 'info'})
    df, resumen, detalle_sin_resolver = completar_especialidad_por_agrupador(df)
    logs.append({
        'text': f"✓ Completados por AGRUPADOR: {resumen['cuil'] + resumen['puesto']} "
                f"({resumen['cuil']} por CUIL, {resumen['puesto']} por puesto)",
        'type': 'success',
    })

    # Forzar mayúsculas + sin tilde
    automation.resultado_df = automation._forzar_mayusculas(df)

    # Reporte de cobertura
    for linea in resumen_cobertura(
        automation.resultado_df,
        columna_especialidad='ESPECIALIDAD',
        columna_cod_reg='CODIGO DE REGISTRO',
    ):
        logs.append({'text': linea, 'type': 'info'})

    # Actualizar detalle_calidad
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
    s = sessions.pop(session_id, None)
    if s:
        folder = TMP_DIR / session_id
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)


def _save_df(session_id: str, df: pd.DataFrame):
    """Persiste el DataFrame procesado en disco (parquet)."""
    path = TMP_DIR / session_id / 'resultado.parquet'
    # Forzar columnas object a string puro para evitar errores de pyarrow
    # con columnas mixtas (int + str) como CODIGO DE REGISTRO
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
        'automation':   None,
        'normalizado':  False,
        'procesado':    False,
        'cruzado':      False,
        'cargos_path':  None,
        'last_access':  time(),
    }
    (TMP_DIR / sid).mkdir(exist_ok=True)
    return {'session_id': sid}


@app.post('/upload-cargos')
async def upload_cargos(session_id: str = Form(...), file: UploadFile = File(...)):
    s = get_session(session_id)
    folder = TMP_DIR / session_id
    folder.mkdir(exist_ok=True)

    dest = folder / file.filename
    content = await file.read()
    dest.write_bytes(content)

    # Contar filas para feedback rápido
    try:
        df = pd.read_excel(dest, sheet_name='Sheet1', nrows=1)
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
    excluidos: list[str] = []  # id_sial a excluir del guardado


def _start_job(fn, *args) -> str:
    """Lanza fn(*args) en un thread, persiste estado en disco y devuelve el job_id."""
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
    return Response(content=_json.dumps(job, ensure_ascii=True, default=str),
                    media_type='application/json')


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

    jid = _start_job(_run)
    return {'job_id': jid}


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

    jid = _start_job(_run)
    return {'job_id': jid}


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

    jid = _start_job(_run)
    return {'job_id': jid}


@app.get('/preview')
def preview(
    session_id: str = Query(...),
    page:  int = Query(1,  ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    s = get_session(session_id)
    # Intentar desde memoria primero, luego desde disco
    if s['automation'] is not None:
        df = s['automation'].resultado_df
    else:
        df = _load_df(session_id)
        if df is None:
            raise HTTPException(400, 'Sin datos procesados')
        s['procesado'] = True

    df    = df
    total = len(df)
    start = (page - 1) * limit
    chunk = df.iloc[start:start + limit]

    # Reemplazar NaN / inf con None para JSON
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


# ── Mapeo columnas resultado → columnas BD ────────────────────────────────────
COL_MAP = {
    'ID SIAL':               'id_sial',
    'CUIL':                  'cuil',
    'CUIL Y ROL':            'cuil_y_rol',
    'AYN':                   'ayn',
    'FECHA NACIMIENTO':      'fecha_nacimiento',
    'EDAD':                  'edad',
    'SEXO':                  'sexo',
    'TIPO DOC':              'tipo_doc',
    'NUMERO DOC':            'numero_doc',
    'CODIGO REPA':           'codigo_repa',
    'DESCRIPCION REPA':      'descripcion_repa',
    'SIGLAS':                'siglas',
    'UNIVERSO TOTALIZADOR':  'universo_totalizador',
    'TIPO DE HOSPITAL / SIGLA': 'tipo_hospital_sigla',
    'MONOVALENCIA':          'monovalencia',
    'ESCALAFON':             'escalafon',
    'CODIGO DE REGISTRO':    'codigo_de_registro',
    'LITERAL CR':            'literal_cr',
    'REGIMEN':               'regimen',
    'SITUACION DE REVISTA':  'situacion_de_revista',
    'PUESTO':                'puesto',
    'LITERAL PUESTO':        'literal_puesto',
    'ESPECIALIDAD':          'especialidad',
    'UNIFICADOR DE PUESTOS': 'unificador_de_puestos',
    'AGRUPADOR':             'agrupador',
    'CODIGO JEFATURAS':      'codigo_jefaturas',
    'JEFE ESCALAFON':        'jefe_escalafon',
    'ESTADO':                'estado',
}
BD_COLS = list(COL_MAP.values())  # columnas en dot_resultado (sin fecha_proceso)


import math as _math
try:
    import numpy as _np
    _NP_INT   = _np.integer
    _NP_FLOAT = _np.floating
except ImportError:
    _NP_INT = _NP_FLOAT = type(None)


def _safe_val(v):
    if v is None: return None
    if isinstance(v, _NP_INT):   return int(v)
    if isinstance(v, _NP_FLOAT):
        f = float(v)
        return None if (_math.isnan(f) or _math.isinf(f)) else f
    if isinstance(v, float):
        return None if (_math.isnan(v) or _math.isinf(v)) else v
    if hasattr(v, 'isoformat'):  return v.isoformat()[:10]
    if isinstance(v, str):
        import re as _re
        m = _re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', v.strip())
        if m: return f'{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}'
    return v


def _sid(v):
    if v is None: return None
    if isinstance(v, float): return str(int(v)) if not _math.isnan(v) else None
    if isinstance(v, _NP_FLOAT): return str(int(v))
    if isinstance(v, _NP_INT):   return str(int(v))
    return str(v)


def _cols_watch_presentes(cols_presentes):
    COLS_WATCH = ['ayn', 'siglas', 'escalafon', 'codigo_de_registro',
                  'literal_puesto', 'especialidad', 'unificador_de_puestos',
                  'agrupador', 'estado', 'situacion_de_revista', 'universo_totalizador']
    return [c for c in COLS_WATCH if c in cols_presentes]


def _es_historico(fecha_asignada: str | None) -> bool:
    """True si fecha_asignada es estrictamente anterior al snapshot más reciente."""
    if not fecha_asignada:
        return False
    conn = db_connect()
    cur  = conn.cursor()
    cur.execute('SELECT MAX(fecha_asignada) FROM dot_resultado_historico')
    row = cur.fetchone()
    cur.close(); conn.close()
    max_fecha = row[0]  # date o None
    if max_fecha is None:
        return False
    from datetime import date
    return date.fromisoformat(fecha_asignada) < max_fecha


@app.post('/diff')
async def diff(body: SessionBody):
    """Calcula diferencias. Si fecha_asignada es histórica, compara contra el
    snapshot anterior más cercano en dot_resultado_historico. Si es vigente,
    compara contra dot_resultado (estado actual)."""
    s = get_session(body.session_id)
    if not s['cruzado'] or s['automation'] is None:
        raise HTTPException(400, 'Primero completa el paso Cruzar')

    def _run():
        df = s['automation'].resultado_df.copy()
        df = df.rename(columns=COL_MAP)
        cols_presentes = [c for c in BD_COLS if c in df.columns]
        df = df[cols_presentes].copy()
        df['id_sial'] = df['id_sial'].apply(_sid)

        watch_presentes = _cols_watch_presentes(cols_presentes)
        cols_cmp = list(dict.fromkeys(['id_sial', 'cuil_y_rol', 'ayn'] + watch_presentes))
        cols_cmp = [c for c in cols_cmp if c in cols_presentes]

        conn = db_connect()
        cur  = conn.cursor(dictionary=True)

        historico = _es_historico(body.fecha_asignada)
        if historico and body.fecha_asignada:
            # Comparar contra el snapshot inmediatamente anterior a fecha_asignada
            cur.execute("""
                SELECT MAX(fecha_asignada) FROM dot_resultado_historico
                WHERE fecha_asignada < %s
            """, (body.fecha_asignada,))
            row = cur.fetchone()
            fecha_ref = list(row.values())[0] if row else None
            if fecha_ref:
                cur.execute("""
                    SELECT proceso_id FROM dot_resultado_historico
                    WHERE fecha_asignada = %s LIMIT 1
                """, (fecha_ref,))
                pid_row = cur.fetchone()
                pid_ref = pid_row['proceso_id'] if pid_row else None
                if pid_ref:
                    cols_h = [c for c in cols_cmp if c in
                              ['id_sial','cuil_y_rol','ayn','siglas','escalafon',
                               'codigo_de_registro','literal_puesto','especialidad',
                               'unificador_de_puestos','agrupador','estado',
                               'situacion_de_revista','universo_totalizador']]
                    cur.execute('SELECT ' + ', '.join('`'+c+'`' for c in cols_h) +
                                ' FROM dot_resultado_historico WHERE proceso_id = %s', (pid_ref,))
                    actuales = {str(r['id_sial']): r for r in cur.fetchall()}
                else:
                    actuales = {}
            else:
                actuales = {}
        else:
            cur.execute('SELECT ' + ', '.join('`' + c + '`' for c in cols_cmp) + ' FROM dot_resultado')
            actuales = {str(r['id_sial']): r for r in cur.fetchall()}

        cur.close()
        conn.close()

        nuevos_ids   = {r for r in df['id_sial'].dropna()}
        actuales_ids = set(actuales.keys())

        # Nuevos
        nuevos = []
        for _, row in df[df['id_sial'].isin(nuevos_ids - actuales_ids)].iterrows():
            nuevos.append({
                'id_sial':    str(row.get('id_sial') or ''),
                'cuil_y_rol': str(row.get('cuil_y_rol') or ''),
                'ayn':        str(row.get('ayn') or ''),
                'siglas':     str(row.get('siglas') or ''),
                'escalafon':  str(row.get('escalafon') or ''),
                'literal_puesto': str(row.get('literal_puesto') or ''),
                'especialidad':   str(row.get('especialidad') or ''),
            })

        # Eliminados
        eliminados = []
        for id_s in (actuales_ids - nuevos_ids):
            ant = actuales[id_s]
            eliminados.append({
                'id_sial':    id_s,
                'cuil_y_rol': str(ant.get('cuil_y_rol') or ''),
                'ayn':        str(ant.get('ayn') or ''),
                'siglas':     str(ant.get('siglas') or ''),
                'escalafon':  str(ant.get('escalafon') or ''),
                'literal_puesto': str(ant.get('literal_puesto') or ''),
                'especialidad':   str(ant.get('especialidad') or ''),
            })

        # Modificados — agrupados por persona
        modificados_map = {}
        for _, row in df[df['id_sial'].isin(nuevos_ids & actuales_ids)].iterrows():
            id_s = str(row['id_sial'])
            ant  = actuales.get(id_s, {})
            cambios = []
            for col in watch_presentes:
                v_ant = str(_safe_val(ant.get(col)) or '')
                v_new = str(_safe_val(row.get(col)) or '')
                if v_ant != v_new:
                    cambios.append({'campo': col, 'antes': v_ant or None, 'despues': v_new or None})
            if cambios:
                modificados_map[id_s] = {
                    'id_sial':    id_s,
                    'cuil_y_rol': str(row.get('cuil_y_rol') or ''),
                    'ayn':        str(row.get('ayn') or ''),
                    'siglas':     str(row.get('siglas') or ''),
                    'cambios':    cambios,
                }

        return {
            'nuevos':      nuevos,
            'eliminados':  eliminados,
            'modificados': list(modificados_map.values()),
            'total_nuevos':      len(nuevos),
            'total_eliminados':  len(eliminados),
            'total_modificados': len(modificados_map),
            'total_campos_modificados': sum(len(m['cambios']) for m in modificados_map.values()),
        }

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        import traceback
        raise HTTPException(500, str(e) + ' | ' + traceback.format_exc())


@app.post('/guardar-bd')
async def guardar_bd(body: SessionBody):
    s = get_session(body.session_id)
    if not s['cruzado'] or s['automation'] is None:
        raise HTTPException(400, 'Primero completa el paso Cruzar')

    proceso_id     = str(uuid.uuid4())
    fecha_asignada = body.fecha_asignada  # YYYY-MM-DD o None
    es_historico   = _es_historico(fecha_asignada)

    def _run():
        from datetime import date as _date
        df = s['automation'].resultado_df.copy()
        df = df.rename(columns=COL_MAP)
        # Aplicar exclusiones del usuario (id_sial a no guardar)
        if body.excluidos:
            excl = set(body.excluidos)
            df = df[~df['id_sial'].apply(_sid).isin(excl)]
        cols_presentes = [c for c in BD_COLS if c in df.columns]
        df = df[cols_presentes].copy()
        df['id_sial'] = df['id_sial'].apply(_sid)

        watch_presentes = _cols_watch_presentes(cols_presentes)
        ahora      = __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        fecha_snap = fecha_asignada or str(_date.today())

        conn = db_connect()
        cur  = conn.cursor(dictionary=True)

        # ── 1. Siempre guardar snapshot histórico ─────────────────────────────
        # Verificar si ya existe un snapshot para esta fecha (evitar duplicados)
        cur.execute('SELECT COUNT(*) as n FROM dot_resultado_historico WHERE fecha_asignada = %s', (fecha_snap,))
        ya_existe = cur.fetchone()['n'] > 0
        if ya_existe:
            cur.execute('DELETE FROM dot_resultado_historico WHERE fecha_asignada = %s', (fecha_snap,))

        HIST_COLS = ['id_sial','cuil','cuil_y_rol','ayn','siglas','universo_totalizador',
                     'escalafon','codigo_de_registro','literal_puesto','especialidad',
                     'unificador_de_puestos','agrupador','codigo_jefaturas','jefe_escalafon',
                     'estado','situacion_de_revista']
        hist_presentes = [c for c in HIST_COLS if c in cols_presentes]
        h_names = ', '.join(['proceso_id','fecha_asignada','fecha_proceso'] + ['`'+c+'`' for c in hist_presentes])
        h_ph    = ', '.join(['%s'] * (3 + len(hist_presentes)))
        sql_hist = f'INSERT INTO dot_resultado_historico ({h_names}) VALUES ({h_ph})'
        batch_h = []
        for _, row in df.iterrows():
            batch_h.append((proceso_id, fecha_snap, ahora) + tuple(_safe_val(row.get(c)) for c in hist_presentes))
            if len(batch_h) == 500:
                cur.executemany(sql_hist, batch_h); batch_h = []
        if batch_h:
            cur.executemany(sql_hist, batch_h)

        # ── 2. Solo actualizar dot_resultado si NO es histórico ───────────────
        inserts = deletes = 0
        regs_act = campos_mod = 0
        historial = []

        if not es_historico:
            cols_cmp = list(dict.fromkeys(['id_sial'] + watch_presentes))
            cur.execute('SELECT ' + ', '.join('`'+c+'`' for c in cols_cmp) + ' FROM dot_resultado')
            actuales     = {str(r['id_sial']): r for r in cur.fetchall()}
            nuevos_ids   = set(df['id_sial'].dropna())
            actuales_ids = set(actuales.keys())
            ins_ids      = nuevos_ids - actuales_ids
            del_ids      = actuales_ids - nuevos_ids

            col_names    = ', '.join('`'+c+'`' for c in cols_presentes)
            placeholders = ', '.join(['%s'] * len(cols_presentes))
            update_parts = ', '.join('`'+c+'`=VALUES(`'+c+'`)' for c in cols_presentes if c != 'id_sial')
            sql_upsert   = ('INSERT INTO dot_resultado ('+col_names+') VALUES ('+placeholders+')'
                            ' ON DUPLICATE KEY UPDATE '+update_parts+', fecha_proceso=NOW()')
            batch = []
            for _, row in df.iterrows():
                batch.append(tuple(_safe_val(row[c]) for c in cols_presentes))
                if len(batch) == 500:
                    cur.executemany(sql_upsert, batch); batch = []
            if batch:
                cur.executemany(sql_upsert, batch)

            if del_ids:
                cur.execute('DELETE FROM dot_resultado WHERE id_sial IN (' + ','.join(['%s']*len(del_ids)) + ')', list(del_ids))

            # Historial de cambios
            for _, row in df[df['id_sial'].isin(ins_ids)].iterrows():
                historial.append((proceso_id, ahora, 'insert', str(row['id_sial']),
                                  str(row.get('cuil_y_rol') or ''), str(row.get('ayn') or ''), None, None, None))
            for _, row in df[df['id_sial'].isin(nuevos_ids & actuales_ids)].iterrows():
                id_s = str(row['id_sial'])
                for col in watch_presentes:
                    v_ant = str(_safe_val(actuales[id_s].get(col)) or '')
                    v_new = str(_safe_val(row.get(col)) or '')
                    if v_ant != v_new:
                        historial.append((proceso_id, ahora, 'update', id_s,
                                          str(row.get('cuil_y_rol') or ''), str(row.get('ayn') or ''),
                                          col, v_ant or None, v_new or None))
            for id_s in del_ids:
                ant = actuales[id_s]
                historial.append((proceso_id, ahora, 'delete', id_s,
                                  str(ant.get('cuil_y_rol') or ''), str(ant.get('ayn') or ''), None, None, None))

            es_carga_inicial = 1 if not actuales else 0
            if historial:
                cur.executemany(
                    'INSERT INTO dot_resultado_historial_cambios'
                    ' (proceso_id,fecha_proceso,accion,id_sial,cuil_y_rol,ayn,campo,valor_anterior,valor_nuevo,es_carga_inicial)'
                    ' VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                    [h + (es_carga_inicial,) for h in historial],
                )

            inserts  = len(ins_ids)
            deletes  = len(del_ids)
            regs_act = len({h[3] for h in historial if h[2] == 'update'})
            campos_mod = len([h for h in historial if h[2] == 'update'])

        conn.commit()
        cur.close()
        conn.close()

        return {
            'proceso_id':             proceso_id,
            'fecha_asignada':         fecha_snap,
            'es_historico':           es_historico,
            'insertados':             inserts,
            'registros_actualizados': regs_act,
            'campos_modificados':     campos_mod,
            'eliminados':             deletes,
            'snapshot_guardado':      True,
        }

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        import traceback
        raise HTTPException(500, str(e) + ' | ' + traceback.format_exc())


@app.get('/historial')
def historial(limit: int = Query(10, ge=1, le=50)):
    conn = db_connect()
    cur  = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT proceso_id,
               MIN(fecha_proceso) AS fecha,
               SUM(accion='insert')  AS insertados,
               SUM(accion='delete')  AS eliminados,
               SUM(accion='update')  AS campos_modificados,
               COUNT(DISTINCT CASE WHEN accion='update' THEN id_sial END) AS registros_actualizados,
               MAX(es_carga_inicial) AS es_carga_inicial
        FROM dot_resultado_historial_cambios
        GROUP BY proceso_id
        ORDER BY fecha DESC
        LIMIT %s
    """, (limit,))
    procesos = cur.fetchall()
    resultado = []
    for p in procesos:
        cur.execute("""
            SELECT accion, id_sial, cuil_y_rol, ayn, campo, valor_anterior, valor_nuevo
            FROM dot_resultado_historial_cambios
            WHERE proceso_id = %s AND accion = 'update'
            ORDER BY id_sial, campo
            LIMIT 200
        """, (p['proceso_id'],))
        cambios = cur.fetchall()
        resultado.append({
            **{k: str(v) if hasattr(v, 'isoformat') else v for k, v in p.items()},
            'cambios': cambios,
        })
    cur.close()
    conn.close()
    return resultado


@app.get('/ultima-actualizacion')
def ultima_actualizacion():
    conn = db_connect()
    cur  = conn.cursor(dictionary=True)
    cur.execute('SELECT MAX(fecha_proceso) AS ultima FROM dot_resultado')
    row = cur.fetchone()
    cur.close()
    conn.close()
    ultima = row['ultima'] if row else None
    return {'ultima': str(ultima) if ultima else None}
