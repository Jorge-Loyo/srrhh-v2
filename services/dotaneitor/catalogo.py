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


# Sufijo de nivel "(NN)" al final del nombre del puesto de conducción. Mismo
# criterio que derivarCargosConduccion.ts (sinNivel). S22-12 Opción B / Finding 1.
_SUFIJO_NIVEL = re.compile(r'\s*\(\d+\)\s*$')


def _sin_nivel(s) -> str:
    """_norm + quita el sufijo (NN) de nivel. Clave para matchear el nombre del
    puesto de conducción contra el literal de jcat_cargo_jefatura (sin sufijo)."""
    return _SUFIJO_NIVEL.sub('', _norm(s)).strip()


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
        # jcat (upper) → cargo_jefatura (texto) — S22-10
        self.jcat_a_cargo: dict[str, str] = {}
        # jcat (upper) → familia (P|G|Z) — S22-12 Opción B
        self.jcat_a_familia: dict[str, str] = {}
        # (escalafon_id, nombre_sin_nivel) → puesto_cargo_id, SOLO conducción — S22-12
        self.puesto_conduccion_por_escalafon: dict[tuple[str, str], str] = {}
        # Escalafón de conducción CPH (familias P/G): código canónico '22' — S22-12
        self._escalafon_id_22: str | None = None
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
            jcat = pd.read_sql(text(
                'SELECT jcat, cargo_jefatura, familia FROM jcat_cargo_jefatura'
            ), conn)
            # Puestos de CONDUCCIÓN para la FK de jefatura (S22-12 Opción B).
            # Finding 3/6: se filtra tipo_puesto='conduccion' — así el
            # Sub-Director CPH (cargado como ejecucion sin curar) NO entra y la
            # jefatura resuelve a null limpio en vez de a un enlace incorrecto.
            puestos_cond = pd.read_sql(text(
                "SELECT id, escalafon_id, nombre FROM puestos_cargo "
                "WHERE activo = true AND tipo_puesto = 'conduccion'"
            ), conn)
            esc22 = pd.read_sql(text(
                "SELECT id FROM escalafones WHERE codigo = '22'"
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
        self.jcat_a_cargo = {
            str(r.jcat).strip().upper(): r.cargo_jefatura for r in jcat.itertuples()
        }
        self.jcat_a_familia = {
            str(r.jcat).strip().upper(): str(r.familia).strip().upper()
            for r in jcat.itertuples()
        }
        # (escalafon_id, nombre_sin_nivel) → puesto_cargo_id, SOLO conducción.
        # modalidad fuera de la clave porque conducción es modalidad='ambos'
        # (único por (escalafon, nombre sin nivel)).
        self.puesto_conduccion_por_escalafon = {
            (str(r.escalafon_id), _sin_nivel(r.nombre)): str(r.id)
            for r in puestos_cond.itertuples()
        }
        self._escalafon_id_22 = str(esc22.iloc[0]['id']) if not esc22.empty else None

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

    def resolver_cargo_jefatura(self, jcat) -> str | None:
        """JCAT → cargo de jefatura (texto, Opción A). None si no hay JCAT o no
        está mapeado (JCAT sin mapeo no frena: se informa en el reporte)."""
        if jcat is None or (isinstance(jcat, float) and pd.isna(jcat)):
            return None
        return self.jcat_a_cargo.get(str(jcat).strip().upper())

    def resolver_cargo_jefatura_id(self, jcat, escalafon_id_fila: str | None) -> str | None:
        """JCAT → puesto_cargo_id del puesto de CONDUCCIÓN (Opción B, FK).

        Deriva el nombre del puesto de conducción del mismo texto que
        resolver_cargo_jefatura (cargo_jefatura) y lo busca —con clave sin sufijo
        de nivel (NN), espejo de derivarCargosConduccion.sinNivel— contra el
        índice de puestos de CONDUCCIÓN del escalafón de la familia del JCAT
        (P/G → 22; Z → cod_reg de la fila). Devuelve None (sin frenar, se informa)
        cuando no hay JCAT/mapeo, o el puesto de conducción no existe en el
        catálogo (familia Z hoy, Sub-Director CPH sin curar/mis-tipeado). NO hace
        auto-alta."""
        if jcat is None or (isinstance(jcat, float) and pd.isna(jcat)):
            return None
        jcat_u = str(jcat).strip().upper()
        nombre = self.jcat_a_cargo.get(jcat_u)
        familia = self.jcat_a_familia.get(jcat_u)
        if not nombre or not familia:
            return None
        esc_cond = self._escalafon_id_22 if familia in ('P', 'G') else escalafon_id_fila
        if not esc_cond:
            return None
        return self.puesto_conduccion_por_escalafon.get((esc_cond, _sin_nivel(nombre)))

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
