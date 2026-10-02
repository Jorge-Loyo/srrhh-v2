"""
Dotaneitor v2 — Pipeline lineal (Sprint 22)

Un único flujo síncrono de punta a punta que reemplaza el modelo de
sesión + jobs + preview del `main.py` viejo:

    recibe Excel  →  normaliza  →  procesa (limpieza + cruces de negocio)
                  →  [dataset de dotación]  →  FIN

S22-1 (esqueleto): armó el flujo lineal reutilizando DotacionAutomation.procesar().
S22-2: el procesamiento pasa a lógica lineal PROPIA (`_procesar_lineal`) que
       CONSERVA el negocio probado (limpieza SIGLA, cruce SIGLAS, JEFE ESCALAFON,
       dedup ID SIAL, jefaturas duplicadas) reutilizando los métodos de
       DotacionAutomation, y ELIMINA los pasos que el sprint saca: unificador
       (6), agrupador (7), estado (9).
S22-3: normalización total a minúscula + sin tilde; columnas de salida en
       snake_case sin tilde/espacios (arregla `documentacion_pou`, `antiguedad`).

Convive en paralelo con el flujo viejo (sessions/jobs) hasta que S22-9 corte el
consumo de Node. No borra nada del `main.py` actual.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd


# ── Normalización de texto a minúscula + sin tilde (S22-3) ────────────────────
# Base copiada de especialidad_por_agrupador.TABLA_SIN_TILDE (no toca 'ñ').
_TABLA_SIN_TILDE = str.maketrans('áéíóúÁÉÍÓÚ', 'aeiouAEIOU')


def minuscula_sin_tilde(texto):
    """Minúscula + sin tilde (á/é/í/ó/ú). No toca 'ñ' ni dígitos/símbolos. Para
    cualquier otro tipo devuelve el valor tal cual (no fuerza str sobre NaN)."""
    if not isinstance(texto, str):
        return texto
    return texto.translate(_TABLA_SIN_TILDE).lower()


def _col_snake(nombre: str) -> str:
    """Nombre de columna a snake_case sin tilde/espacios: minúscula, sin tilde,
    espacios y '/' → '_', colapsa repetidos. Ej. 'TIPO DE HOSPITAL / SIGLA' →
    'tipo_de_hospital_sigla', 'ANTIGÜEDAD' → 'antiguedad'."""
    s = nombre.translate(_TABLA_SIN_TILDE).lower()
    s = s.replace('ü', 'u').replace('ö', 'o')  # diéresis que la tabla no cubre
    # separadores → '_'
    for ch in (' ', '/', '-', '.', '(', ')'):
        s = s.replace(ch, '_')
    while '__' in s:
        s = s.replace('__', '_')
    return s.strip('_')


# Columnas que NO se bajan a minúscula (identificadores en mayúscula). Las siglas
# de efector son códigos (HGARM, SSAPAC…), no texto libre.
_COLUMNAS_NO_MINUSCULA = {'siglas'}


@dataclass
class ResultadoPipeline:
    """Salida del pipeline lineal."""
    ok: bool
    mensaje: str
    df: pd.DataFrame | None = None
    reporte: dict = field(default_factory=dict)
    logs: list[dict] = field(default_factory=list)

    @property
    def filas(self) -> int:
        return 0 if self.df is None else len(self.df)


# ── Columnas de salida v2 (S22-3) ─────────────────────────────────────────────
# Rename del padrón crudo → nombre canónico snake_case. Se QUITARON unificador,
# agrupador y estado (los calcula/arma Node o filtros, no el Dotaneitor).
_RENAME = {
    'CARGO': 'id_sial',
    'FEC_NACIM': 'fecha_nacimiento',
    'TIP_DOC': 'tipo_doc',
    'NUM_DOC': 'numero_doc',
    'COD_REP': 'codigo_repa',
    'DESC_REP': 'descripcion_repa',
    'SIGLA': 'siglas',
    'Tipo de Hospital / Sigla': 'tipo_de_hospital_sigla',
    'Monovalencia': 'monovalencia',
    'COD_REG': 'codigo_de_registro',
    'LIT_COD_REG': 'literal_cr',
    'SIT_REV': 'situacion_de_revista',
    'LIT_PUESTO': 'literal_puesto',
    'LIT_ESP_CARGO': 'especialidad',
    'JCAT': 'codigo_jefaturas',
    'JEFATURA ESCALAFON': 'jefe_escalafon',
    'DOC_RESPALD': 'documentacion_jefatura',
    'J_COMENTARIO': 'comentarios_jefaturas',
    'DOC_RESP': 'documentacion_pou',  # arregla el typo 'DOCUEMNTACION POU'
    'SR_WU_COMISION': 'comision',
    'SR_DESC_WU_COMISION': 'repa_comision',
    'LIT_AGRUPAMIENTO': 'agrupamiento',
    'COD_SIT': 'cod_situacion',
    'BLOQ_DESDE': 'fecha_bloqueo',
    'BLOQ_COMENTARIO': 'bloqueo_comentario',
    'BL_MOTIVO': 'bloq_motivo',
    'DOC_RESP_ALTA': 'documentacion_del_rol',
    'DOC_RESP_BAJA': 'documentacion_baja',
    'SALUD_1ER_CARGO': 'antiguedad',  # arregla 'ANTIGÜEDAD' con diéresis
    'UNIVERSO TOTALIZADOR': 'universo_totalizador',
}

# Orden de salida (snake_case). Sin unificador/agrupador/estado.
_ORDEN_SALIDA = [
    'id_sial', 'cuil', 'cuil_y_rol', 'ayn', 'fecha_nacimiento', 'edad', 'sexo',
    'tipo_doc', 'numero_doc', 'codigo_repa', 'descripcion_repa', 'siglas',
    'universo_totalizador', 'tipo_de_hospital_sigla', 'monovalencia', 'escalafon',
    'codigo_de_registro', 'literal_cr', 'regimen', 'situacion_de_revista', 'puesto',
    'literal_puesto', 'especialidad', 'codigo_jefaturas', 'jefe_escalafon',
    'documentacion_jefatura', 'comentarios_jefaturas', 'escritorio', 'pou_desde',
    'dia', 'documentacion_pou', 'sr_doc_respald', 'sr_comentario', 'comision',
    'repa_comision', 'cr_comentario', 'cod_agrupamiento', 'agrupamiento',
    'cod_situacion', 'telefono', 'mail_personal', 'mail_laboral', 'domicilio',
    'localidad', 'provincia', 'fecha_bloqueo', 'bloqueo_comentario', 'bloq_motivo',
    'cargo_desde', 'cargo_hasta', 'documentacion_del_rol', 'documentacion_baja',
    'antiguedad',
]


def _procesar_lineal(df: pd.DataFrame, auto, logs: list[dict]) -> tuple[pd.DataFrame, dict]:
    """Procesamiento de negocio lineal (S22-2). Reutiliza los métodos probados de
    `auto` (DotacionAutomation) para no reinventar el negocio, pero controla el
    flujo y OMITE unificador/agrupador/estado. `auto` ya debe tener siglas_df
    cargado (via cargar_archivos)."""
    import numpy as np  # noqa: F401 (lo usa _calcular_jefe_escalafon de auto)

    df = df.copy()

    # ── Paso 0: limpieza SIGLA (UAIEAIT→EAIT, quitar DGA de DGAH*) ─────────────
    df['SIGLA'] = df['SIGLA'].str.replace('UAIEAIT', 'EAIT', regex=False)
    df['SIGLA'] = df['SIGLA'].apply(
        lambda x: x[3:] if pd.notna(x) and isinstance(x, str) and x.startswith('DGAH') else x
    )
    # COD_REG 22 → literal CR "Nueva Carrera Prof. Hosp"
    df.loc[df['COD_REG'].astype(str).str.replace('B', '').str.strip() == '22', 'LIT_COD_REG'] = 'Nueva Carrera Prof. Hosp'

    # ── Pasos 1–4: identidad (rol, cuil, cuil_y_rol) ──────────────────────────
    df['ROL'] = df['CARGO'].apply(auto.extraer_rol_de_cargo)
    df['CUIL'] = df['CUIL'].apply(auto.limpiar_cuil)
    df['CUIL Y ROL'] = df['CUIL'].astype(str) + '-' + df['ROL'].astype(str)
    df = df.drop(columns=['ROL'])

    # ── Paso 5: cruce SIGLAS (universo / tipo hospital / monovalencia) ────────
    siglas_map = {}
    for _, row in auto.siglas_df.iterrows():
        siglas_map[row['Sigla']] = {
            'UNIVERSO TOTALIZADOR': row.get('UNIVERSO TOTALIZADOR'),
            'Tipo de Hospital / Sigla': row.get('Tipo de Hospital / Sigla'),
            'Monovalencia': row.get('Monovalencia'),
        }
    df['UNIVERSO TOTALIZADOR'] = df['SIGLA'].map(lambda x: siglas_map.get(x, {}).get('UNIVERSO TOTALIZADOR'))
    df['Tipo de Hospital / Sigla'] = df['SIGLA'].map(lambda x: siglas_map.get(x, {}).get('Tipo de Hospital / Sigla'))
    df['Monovalencia'] = df['SIGLA'].map(lambda x: siglas_map.get(x, {}).get('Monovalencia'))

    mask_sin_sigla = df['SIGLA'].notna() & ~df['SIGLA'].isin(siglas_map.keys())
    siglas_no_encontradas = sorted(str(s) for s in df.loc[mask_sin_sigla, 'SIGLA'].unique())

    # ── Pasos 6 y 7 (unificador / agrupador): ELIMINADOS en v2 ────────────────
    # ── Paso 9 (estado como columna): ELIMINADO en v2 ─────────────────────────

    # ── Paso 7.6: limpiar JCAT ('0' = sin jefatura → None) ────────────────────
    df['JCAT'] = df['JCAT'].apply(lambda x: None if pd.isna(x) or str(x).strip() == '0' else x)

    # ── Paso 8: JEFE ESCALAFON (regla de negocio probada, reusa auto) ─────────
    df['JEFATURA ESCALAFON'] = auto._calcular_jefe_escalafon(df)

    # ── Paso 9.5: rename a snake_case (define el contrato de salida v2) ───────
    # Primero el rename explícito (columnas cuyo nombre canónico difiere del
    # crudo), luego _col_snake sobre TODAS las columnas restantes para que las
    # que vienen del padrón con su nombre crudo (CUIL, AYN, SEXO, TELEFONO…)
    # también queden en snake_case sin tilde. 'CUIL Y ROL' → 'cuil_y_rol'.
    df = df.rename(columns=_RENAME)
    df = df.rename(columns={c: _col_snake(c) for c in df.columns})

    # ── Paso 9.6: limpiar ESPECIALIDAD en cód. registro sin especialidad ──────
    # Columnas ya en snake_case (post-rename): se pasan los nombres explícitos.
    from especialidades import limpiar_especialidad_indebida, filas_especialidad_sin_puesto
    df, especialidad_limpiada, cod_reg_limpiados, _detalle = limpiar_especialidad_indebida(
        df,
        columna_especialidad='especialidad',
        columna_cod_reg='codigo_de_registro',
        columna_identificador='cuil_y_rol',
        columna_nombre='ayn',
    )
    detalle_sin_puesto = filas_especialidad_sin_puesto(
        df,
        columna_especialidad='especialidad',
        columna_puesto='literal_puesto',
        columna_identificador='cuil_y_rol',
        columna_nombre='ayn',
    )
    especialidad_sin_puesto = (
        detalle_sin_puesto['cuil_y_rol'].tolist()
        if 'cuil_y_rol' in detalle_sin_puesto.columns else []
    )

    # ── Paso 9.75: normalización TOTAL a minúscula + sin tilde (S22-3) ────────
    # Reemplaza _forzar_mayusculas. Aplica a TODAS las columnas salvo las
    # identificadoras (siglas). No se filtra por dtype: pandas puede cargar
    # columnas del Excel como dtype 'str'/'string' (no 'object'), y filtrar por
    # ==object las saltaba (bug: ESCALAFON/AYN quedaban con tilde/mayúscula).
    # minuscula_sin_tilde ya devuelve los no-strings (números, NaN) tal cual.
    for col in df.columns:
        if col in _COLUMNAS_NO_MINUSCULA:
            continue
        df[col] = df[col].map(minuscula_sin_tilde)

    # ── Paso 9.8: dedup ID SIAL (negocio probado, reusa auto) ─────────────────
    df, dup_grupos, dup_filas, _detalle_dup = auto._eliminar_duplicados_id_sial(df, columna_id='id_sial')

    # ── Paso 9.9: jefaturas duplicadas (negocio probado) ──────────────────────
    # _detectar_jefaturas_duplicadas usa nombres de columna en MAYÚSCULA del
    # flujo viejo; en v2 las columnas son snake_case. Se adapta el chequeo acá.
    jefaturas_dup = _eliminar_jefaturas_duplicadas_v2(df)
    df, jefaturas_dup_count = jefaturas_dup

    # ── Paso 10: reordenar al set de salida v2 ────────────────────────────────
    columnas_orden = [c for c in _ORDEN_SALIDA if c in df.columns]
    otras = [c for c in df.columns if c not in columnas_orden]
    df = df[columnas_orden + otras].reset_index(drop=True)

    reporte = {
        'sin_sigla': siglas_no_encontradas,
        'especialidad_limpiada': especialidad_limpiada,
        'especialidad_limpiada_cod_reg': cod_reg_limpiados,
        'especialidad_sin_puesto': especialidad_sin_puesto,
        'duplicados_id_sial_grupos': dup_grupos,
        'duplicados_id_sial_filas_eliminadas': dup_filas,
        'jefaturas_duplicadas': jefaturas_dup_count,
    }

    # Logs resumen
    if siglas_no_encontradas:
        logs.append({'text': f"[!] SIGLA sin coincidencia: {len(siglas_no_encontradas)}", 'type': 'warning'})
    if especialidad_limpiada:
        logs.append({'text': f"[!] ESPECIALIDAD vaciada por cod. registro sin especialidad: {especialidad_limpiada} fila(s)", 'type': 'warning'})
    if dup_filas:
        logs.append({'text': f"[!] ID SIAL duplicado: {dup_grupos} cargo(s), {dup_filas} fila(s) eliminada(s)", 'type': 'warning'})
    if jefaturas_dup_count:
        logs.append({'text': f"[!] Jefaturas CPH con rol duplicado: {jefaturas_dup_count} eliminada(s)", 'type': 'warning'})

    return df, reporte


def _eliminar_jefaturas_duplicadas_v2(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Versión snake_case de la detección de jefaturas CPH con rol duplicado
    activo (misma regla que Dotaneitor._detectar_jefaturas_duplicadas): una
    persona con dos roles del mismo literal_puesto en el mismo efector, uno con
    codigo_jefaturas y otro sin → se elimina el que NO tiene codigo_jefaturas.
    En v2 no existe la columna 'estado'; se usa situacion_de_revista='activo'."""
    cols = {'cuil', 'siglas', 'literal_puesto', 'codigo_jefaturas', 'jefe_escalafon', 'id_sial'}
    if not cols.issubset(df.columns):
        return df, 0

    mask_jefe_cph = (
        df['jefe_escalafon'].isin(['jefe cph pof', 'jefe cph pou'])
        & (df['situacion_de_revista'].astype(str).str.strip() == 'activo')
    ) if 'situacion_de_revista' in df.columns else df['jefe_escalafon'].isin(['jefe cph pof', 'jefe cph pou'])

    jefes = df.loc[mask_jefe_cph]
    if jefes.empty:
        return df, 0

    def _vacio(v):
        return pd.isna(v) or str(v).strip() == ''

    ids_a_eliminar = set()
    for _, grupo in jefes.groupby(['cuil', 'siglas', 'literal_puesto']):
        if len(grupo) < 2:
            continue
        for _, fila in grupo.iterrows():
            if _vacio(fila.get('codigo_jefaturas')):
                ids_a_eliminar.add(str(fila.get('id_sial')))

    if not ids_a_eliminar:
        return df, 0

    df_out = df[~df['id_sial'].astype(str).isin(ids_a_eliminar)].reset_index(drop=True)
    return df_out, len(ids_a_eliminar)


def procesar_padron(
    cargos_path: str | Path,
    *,
    automation_factory=None,
    normalizador_factory=None,
) -> ResultadoPipeline:
    """Pipeline lineal de punta a punta sobre el Excel de Cargos."""
    logs: list[dict] = []

    if normalizador_factory is None:
        from normalizador_cargos import NormalizadorCargos
        normalizador_factory = NormalizadorCargos
    if automation_factory is None:
        from Dotaneitor import DotacionAutomation
        automation_factory = DotacionAutomation

    cargos_path = str(cargos_path)

    # ── 1. Normalización (mojibake / fechas / teléfonos / nombres) ────────────
    try:
        norm = normalizador_factory()
        df_crudo = pd.read_excel(
            cargos_path, sheet_name='Sheet1',
            dtype={'NUM_DOC': str, 'CODIGO DE REGISTRO': str},
        )
    except ValueError as e:
        return ResultadoPipeline(False, f"El archivo no tiene la hoja 'Sheet1': {e}")
    except FileNotFoundError:
        return ResultadoPipeline(False, f'No se encontró el archivo: {cargos_path}')
    except Exception as e:  # noqa: BLE001
        return ResultadoPipeline(False, f'Error al leer el Excel de Cargos: {e}')

    df_norm = norm.normalizar(df_crudo)
    logs.append({'text': '✓ Normalización completada', 'type': 'success'})
    for linea in norm.generar_lineas_reporte():
        logs.append({'text': linea, 'type': 'info'})

    # ── 2. Cargar catálogos de negocio (siglas) vía la instancia auto ─────────
    # Se reescribe el Excel normalizado para que cargar_archivos lea la versión
    # limpia (igual criterio que el flujo viejo).
    try:
        with pd.ExcelWriter(cargos_path, engine='openpyxl') as w:
            df_norm.to_excel(w, index=False, sheet_name='Sheet1')
    except Exception as e:  # noqa: BLE001
        return ResultadoPipeline(False, f'Error al reescribir el Excel normalizado: {e}', logs=logs)

    auto = automation_factory()
    ok, msg = auto.cargar_archivos(cargos_path)
    if not ok:
        return ResultadoPipeline(False, msg, logs=logs)

    # ── 3. Procesamiento lineal propio (S22-2/3) ──────────────────────────────
    try:
        df_out, reporte = _procesar_lineal(auto.cargos_df, auto, logs)
    except Exception as e:  # noqa: BLE001
        import traceback
        return ResultadoPipeline(False, f'Error en procesamiento: {e}\n{traceback.format_exc()}', logs=logs)

    logs.append({'text': f'✓ {len(df_out)} registros procesados', 'type': 'success'})

    return ResultadoPipeline(
        ok=True,
        mensaje=f'Procesamiento exitoso. {len(df_out)} registros.',
        df=df_out,
        reporte=reporte,
        logs=logs,
    )


def df_a_excel_bytes(df: pd.DataFrame, sheet_name: str = 'Dotacion') -> bytes:
    """Serializa el DataFrame de dotación a bytes xlsx (único Excel que genera v2)."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as w:
        df.to_excel(w, index=False, sheet_name=sheet_name)
    return buf.getvalue()
