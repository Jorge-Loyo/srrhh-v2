"""
Dotaneitor v2 — Pipeline lineal (Sprint 22, S22-1 esqueleto)

Un único flujo síncrono de punta a punta que reemplaza el modelo de
sesión + jobs + preview del `main.py` viejo:

    recibe Excel  →  normaliza  →  procesa (limpieza + cruces de negocio)
                  →  [dataset de dotación]  →  FIN

Esta primera versión (S22-1) es el ESQUELETO: arma el flujo lineal reutilizando
las funciones de negocio ya probadas de `Dotaneitor.py` / `normalizador_cargos.py`
(NO se reinventa nada). La reescritura fina —sacar pasos unificador/agrupador/
estado, normalización total a minúscula, resolución contra catálogo, JCAT→
jefatura, partición de nombre e id_sial_rol— entra en S22-2..S22-16 sobre este
mismo módulo.

Convive en paralelo con el flujo viejo (sessions/jobs) hasta que S22-9 corte el
consumo de Node. No borra nada del `main.py` actual.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd


# El import de Dotaneitor se hace perezoso (dentro de la función) para no acoplar
# el arranque del módulo a la carga de tablas de referencia que hace main.py.
@dataclass
class ResultadoPipeline:
    """Salida del pipeline lineal."""
    ok: bool
    mensaje: str
    # DataFrame procesado (la dotación). None si ok=False.
    df: pd.DataFrame | None = None
    # Reporte de los casos detectados (sin match, duplicados, etc.) para que Node
    # los refleje en el diff. Reemplaza el Excel de reporte de calidad (que se
    # elimina en S22). Estructura libre por ahora; se congela en S22-8.
    reporte: dict = field(default_factory=dict)
    # Logs legibles del proceso (para debug / respuesta de la API).
    logs: list[dict] = field(default_factory=list)

    @property
    def filas(self) -> int:
        return 0 if self.df is None else len(self.df)


def procesar_padron(
    cargos_path: str | Path,
    *,
    automation_factory=None,
    normalizador_factory=None,
) -> ResultadoPipeline:
    """Pipeline lineal de punta a punta sobre el Excel de Cargos.

    Args:
        cargos_path: ruta al Excel de Cargos (hoja 'Sheet1').
        automation_factory: callable que devuelve una instancia tipo
            DotacionAutomation ya configurada para leer catálogos (en producción
            es DotacionAutomationBD de main.py, que lee de Postgres). Permite
            inyectar la dependencia sin que este módulo conozca la subclase BD.
        normalizador_factory: callable que devuelve un NormalizadorCargos.

    Returns:
        ResultadoPipeline con el DataFrame procesado + reporte + logs.
    """
    logs: list[dict] = []

    # Imports perezosos: dependen de las tablas de referencia que main.py carga
    # al arrancar; importarlos acá evita acoplar este módulo a ese arranque.
    if normalizador_factory is None:
        from normalizador_cargos import NormalizadorCargos
        normalizador_factory = NormalizadorCargos
    if automation_factory is None:
        # En producción lo inyecta main.py (DotacionAutomationBD). Como fallback
        # usamos la clase base, que requiere el 2º Excel de catálogos — no apta
        # para prod, solo para no romper el import.
        from Dotaneitor import DotacionAutomation
        automation_factory = DotacionAutomation

    cargos_path = str(cargos_path)

    # ── 1. Normalización (mojibake / fechas / teléfonos / nombres) ────────────
    # Se reescribe el Excel en el lugar con el DataFrame normalizado, igual que
    # el /normalizar viejo, para que el paso de procesar lea la versión limpia.
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
    try:
        with pd.ExcelWriter(cargos_path, engine='openpyxl') as w:
            df_norm.to_excel(w, index=False, sheet_name='Sheet1')
    except Exception as e:  # noqa: BLE001
        return ResultadoPipeline(False, f'Error al reescribir el Excel normalizado: {e}')

    logs.append({'text': '✓ Normalización completada', 'type': 'success'})
    for linea in norm.generar_lineas_reporte():
        logs.append({'text': linea, 'type': 'info'})

    # ── 2. Procesamiento de negocio (limpieza + cruces conservados) ───────────
    # S22-1 reutiliza DotacionAutomation.procesar() tal cual (incluye todavía los
    # pasos unificador/agrupador/estado y la salida en MAYÚSCULA). S22-2/3/5/6
    # recortan y reescriben estos pasos sobre este mismo punto.
    auto = automation_factory()
    ok, msg = auto.cargar_archivos(cargos_path)
    if not ok:
        return ResultadoPipeline(False, msg, logs=logs)

    ok, msg = auto.procesar()
    if not ok:
        return ResultadoPipeline(False, msg, logs=logs)

    logs.append({'text': f'✓ {len(auto.resultado_df)} registros procesados', 'type': 'success'})
    for linea in auto.generar_lineas_reporte_calidad():
        tipo = 'warning' if linea.startswith('[!]') else 'info'
        logs.append({'text': linea, 'type': tipo})

    return ResultadoPipeline(
        ok=True,
        mensaje=f'Procesamiento exitoso. {len(auto.resultado_df)} registros.',
        df=auto.resultado_df,
        reporte=dict(auto.reporte_calidad),
        logs=logs,
    )


def df_a_excel_bytes(df: pd.DataFrame, sheet_name: str = 'Dotacion') -> bytes:
    """Serializa el DataFrame de dotación a bytes xlsx (único Excel que genera v2)."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as w:
        df.to_excel(w, index=False, sheet_name=sheet_name)
    return buf.getvalue()
