"""
Dotaneitor v2 — Catálogo de carrera/puesto/especialidad (Sprint 22, S22-4..7)

Carga el catálogo canónico desde Postgres (puestos_cargo / especialidades_puesto
/ codigos_registro / escalafones) y resuelve, para cada fila del padrón:

  - CARRERA   : codigo_de_registro → escalafon_id      (codigos_registro.escalafon_id)
  - PUESTO    : literal_puesto     → puesto_cargo_id    (dentro de la carrera)
  - ESPECIALIDAD: especialidad     → especialidad_puesto_id (cuelga del puesto)

Política "sin match" (S22-6): un literal/especialidad que no matchea se da de
ALTA en el catálogo con `pendiente_curar=true`, se usa ese id, y el caso se
informa en el reporte (para el diff). El padrón NO se frena.

Se conserva el texto crudo de origen (S22-7): el pipeline guarda
`literal_puesto_origen` / `especialidad_origen` además del id resuelto.

La resolución usa `lower(trim())` sin tilde en ambos lados; la especialidad
aplica además la "regla del paréntesis" (A22-2): se compara lo de FUERA del
paréntesis, salvo la excepción `bioquimica clinica`.
"""
from __future__ import annotations

import re
import unicodedata

import pandas as pd
from sqlalchemy import text


def _norm(s) -> str:
    """lower + trim + sin tilde (unicode) para comparar claves de catálogo."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ''
    s = str(s).strip().lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return s


# Especialidades donde el paréntesis SÍ distingue subespecialidades reales
# (A22-2): no se colapsa. El resto sí (la aclaración entre paréntesis es redundante).
_PARENTESIS_SIGNIFICATIVO = {'bioquimica clinica'}


def _norm_especialidad(s) -> str:
    """Normaliza especialidad para matchear contra el catálogo aplicando la regla
    del paréntesis: se queda con lo de fuera del paréntesis, salvo excepción."""
    base = _norm(s)
    if not base:
        return ''
    fuera = re.sub(r'\s*\([^)]*\)', '', base).strip()
    if fuera in _PARENTESIS_SIGNIFICATIVO:
        return base  # conservar el paréntesis para distinguir subespecialidades
    return fuera or base


class Catalogo:
    """Catálogo en memoria + resolución. Carga una vez (al arrancar main.py) y
    resuelve por fila. Las auto-altas (pendiente_curar) se persisten en la BD y
    se cachean para no repetir el INSERT dentro de la misma corrida."""

    def __init__(self, engine):
        self._engine = engine
        # codigo_registro (str) → escalafon_id (uuid str)
        self.cod_reg_a_escalafon: dict[str, str] = {}
        # (escalafon_id, nombre_norm) → puesto_cargo_id
        self.puesto_por_escalafon: dict[tuple[str, str], str] = {}
        # (puesto_cargo_id, esp_norm) → especialidad_puesto_id
        self.esp_por_puesto: dict[tuple[str, str], str] = {}
        # Contadores de auto-altas de la corrida (para el reporte/diff).
        self.puestos_auto_alta = 0
        self.especialidades_auto_alta = 0
        self.cargar()

    def cargar(self):
        with self._engine.connect() as conn:
            cod_reg = pd.read_sql(text(
                'SELECT codigo, escalafon_id FROM codigos_registro'
            ), conn)
            puestos = pd.read_sql(text(
                'SELECT id, escalafon_id, nombre FROM puestos_cargo WHERE activo = true'
            ), conn)
            esp = pd.read_sql(text(
                'SELECT id, puesto_cargo_id, nombre FROM especialidades_puesto WHERE activo = true'
            ), conn)

        self.cod_reg_a_escalafon = {
            str(r.codigo).strip(): str(r.escalafon_id) for r in cod_reg.itertuples()
        }
        self.puesto_por_escalafon = {
            (str(r.escalafon_id), _norm(r.nombre)): str(r.id) for r in puestos.itertuples()
        }
        self.esp_por_puesto = {
            (str(r.puesto_cargo_id), _norm_especialidad(r.nombre)): str(r.id)
            for r in esp.itertuples()
        }

    # ── Resolución ────────────────────────────────────────────────────────────
    def resolver_escalafon(self, codigo_registro) -> str | None:
        if codigo_registro is None:
            return None
        return self.cod_reg_a_escalafon.get(str(codigo_registro).strip())

    def resolver_puesto(self, escalafon_id: str | None, literal_puesto) -> str | None:
        """puesto_cargo_id por (carrera, literal normalizado). None si no hay
        escalafón o literal. Si no matchea, auto-alta con pendiente_curar."""
        if not escalafon_id:
            return None
        clave = _norm(literal_puesto)
        if not clave:
            return None
        pid = self.puesto_por_escalafon.get((escalafon_id, clave))
        if pid:
            return pid
        return self._auto_alta_puesto(escalafon_id, clave)

    def resolver_especialidad(self, puesto_cargo_id: str | None, especialidad) -> str | None:
        """especialidad_puesto_id por (puesto, especialidad normalizada con regla
        del paréntesis). None si no hay puesto o especialidad. Auto-alta si no
        matchea."""
        if not puesto_cargo_id:
            return None
        clave = _norm_especialidad(especialidad)
        if not clave:
            return None
        eid = self.esp_por_puesto.get((puesto_cargo_id, clave))
        if eid:
            return eid
        return self._auto_alta_especialidad(puesto_cargo_id, clave)

    # ── Auto-alta revisable (S22-6) ────────────────────────────────────────────
    def _auto_alta_puesto(self, escalafon_id: str, nombre_norm: str) -> str:
        with self._engine.begin() as conn:
            # modalidad 'ambos' (neutro: aplica a POF y POU) y tipo_puesto
            # 'ejecucion' por defecto; se afinan al curar el puesto.
            row = conn.execute(text(
                """INSERT INTO puestos_cargo
                     (id, escalafon_id, nombre, modalidad, tipo_puesto, activo, pendiente_curar)
                   VALUES (gen_random_uuid(), CAST(:esc AS uuid), :nombre,
                     CAST('ambos' AS "ModalidadPuesto"), CAST('ejecucion' AS "TipoPuesto"),
                     true, true)
                   RETURNING id"""
            ), {'esc': escalafon_id, 'nombre': nombre_norm}).first()
        pid = str(row[0])
        self.puesto_por_escalafon[(escalafon_id, nombre_norm)] = pid
        self.puestos_auto_alta += 1
        return pid

    def _auto_alta_especialidad(self, puesto_cargo_id: str, nombre_norm: str) -> str:
        with self._engine.begin() as conn:
            row = conn.execute(text(
                """INSERT INTO especialidades_puesto (id, puesto_cargo_id, nombre, activo, pendiente_curar)
                   VALUES (gen_random_uuid(), CAST(:pid AS uuid), :nombre, true, true)
                   RETURNING id"""
            ), {'pid': puesto_cargo_id, 'nombre': nombre_norm}).first()
        eid = str(row[0])
        self.esp_por_puesto[(puesto_cargo_id, nombre_norm)] = eid
        self.especialidades_auto_alta += 1
        return eid
