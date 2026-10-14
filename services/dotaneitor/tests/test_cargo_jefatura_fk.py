"""
Tests S22-12 Opción B — jefatura como FK (no texto).

Cubre la resolución pura `Catalogo.resolver_cargo_jefatura_id` (sin DB) y el
contrato de emisión de la columna `cargo_jefatura_puesto_id` del pipeline hacia
Node pero no al Excel descargable.

Se usa unittest (stdlib) porque este servicio no trae pytest instalado. Correr:
  python -m unittest tests.test_cargo_jefatura_fk  (desde services/dotaneitor)
  python tests/test_cargo_jefatura_fk.py           (runner directo)

Los tests del resolver NO tocan la BD: se instancia Catalogo con
`Catalogo.__new__` y se setean los mapas en memoria a mano.
"""
from __future__ import annotations

import os
import sys
import unittest

import numpy as np
import pandas as pd

# Permitir importar los módulos del servicio tanto si se corre desde la carpeta
# del servicio como desde la raíz del repo.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from catalogo import Catalogo, _sin_nivel, _norm  # noqa: E402
import pipeline  # noqa: E402


# ── IDs ficticios estables (uuid-like) ────────────────────────────────────────
PID_JEFE_DEPTO_22 = "11111111-1111-1111-1111-111111111111"
PID_JEFE_DIV_22 = "22222222-2222-2222-2222-222222222222"
PID_JEFE_SEC_22 = "33333333-3333-3333-3333-333333333333"
ESC_22 = "99999999-9999-9999-9999-999999999999"
ESC_83 = "88888888-8888-8888-8888-888888888888"


def _catalogo_en_memoria() -> Catalogo:
    """Catalogo sin DB: solo los mapas que usa resolver_cargo_jefatura_id."""
    c = Catalogo.__new__(Catalogo)
    # jcat → texto cargo_jefatura (literal SIN sufijo de nivel, como el seed).
    c.jcat_a_cargo = {
        "P02": "Jefe de Departamento",
        "P03": "Jefe de División",
        "P04": "Jefe de Sección",
        "P61": "Sub-Director",          # cargado en catálogo como ejecucion
        "Z02": "Jefe de Departamento",  # familia Z: puesto no sembrado
        "XXX": "Cargo Inexistente",     # jcat sin familia conocida (defensivo)
    }
    c.jcat_a_familia = {
        "P02": "P",
        "P03": "G",
        "P04": "P",
        "P61": "P",
        "Z02": "Z",
        # "XXX" intencionalmente SIN familia
    }
    # Índice de puestos de CONDUCCIÓN, clave (escalafon_id, nombre_sin_nivel).
    # Nota: 'Jefe de División (03)' se catalogó CON sufijo de nivel; _sin_nivel
    # debe hacerlo matchear igual (regresión Finding 1).
    c.puesto_conduccion_por_escalafon = {
        (ESC_22, _sin_nivel("Jefe de Departamento")): PID_JEFE_DEPTO_22,
        (ESC_22, _sin_nivel("Jefe de División (03)")): PID_JEFE_DIV_22,
        (ESC_22, _sin_nivel("Jefe de Sección")): PID_JEFE_SEC_22,
        # Sub-Director NO está: es ejecucion, filtrado por tipo_puesto. Y la
        # familia Z (ESC_83) no tiene puestos de conducción sembrados.
    }
    c._escalafon_id_22 = ESC_22
    return c


class ResolverCargoJefaturaIdTest(unittest.TestCase):
    def setUp(self):
        self.c = _catalogo_en_memoria()

    def test_pg_con_puesto_existente_resuelve(self):
        # Familia P → escalafón 22, puesto existe → id poblado (AC-1).
        self.assertEqual(
            self.c.resolver_cargo_jefatura_id("P02", escalafon_id_fila=ESC_83),
            PID_JEFE_DEPTO_22,
        )
        # Familia G → también escalafón 22 (CPH).
        self.assertEqual(
            self.c.resolver_cargo_jefatura_id("P03", escalafon_id_fila=None),
            PID_JEFE_DIV_22,
        )

    def test_puesto_catalogado_con_sufijo_nivel_igual_resuelve(self):
        # Finding 1 (HIGH): el puesto está catalogado como 'Jefe de División (03)'
        # pero el literal del jcat es 'Jefe de División'. _sin_nivel en ambos
        # lados debe hacerlos matchear.
        self.assertEqual(
            self.c.resolver_cargo_jefatura_id("P03", escalafon_id_fila=None),
            PID_JEFE_DIV_22,
        )

    def test_subdirector_cph_ejecucion_resuelve_none(self):
        # Finding 6 (NIT): Sub-Director CPH está como ejecucion → fuera del
        # índice de conducción → None (hueco limpio, no enlace incorrecto).
        self.assertIsNone(
            self.c.resolver_cargo_jefatura_id("P61", escalafon_id_fila=ESC_22)
        )

    def test_familia_z_sin_puesto_resuelve_none(self):
        # Familia Z: escalafón de la fila (83/85/87), puesto no sembrado → None.
        self.assertIsNone(
            self.c.resolver_cargo_jefatura_id("Z02", escalafon_id_fila=ESC_83)
        )

    def test_familia_z_sin_escalafon_fila_resuelve_none(self):
        # Z sin escalafón de fila → None (no revienta).
        self.assertIsNone(
            self.c.resolver_cargo_jefatura_id("Z02", escalafon_id_fila=None)
        )

    def test_jcat_no_mapeado_resuelve_none(self):
        self.assertIsNone(
            self.c.resolver_cargo_jefatura_id("ZZZ", escalafon_id_fila=ESC_22)
        )

    def test_jcat_sin_familia_resuelve_none(self):
        # 'XXX' tiene cargo pero no familia → None (defensivo).
        self.assertIsNone(
            self.c.resolver_cargo_jefatura_id("XXX", escalafon_id_fila=ESC_22)
        )

    def test_jcat_none_y_nan_resuelven_none(self):
        self.assertIsNone(self.c.resolver_cargo_jefatura_id(None, ESC_22))
        self.assertIsNone(self.c.resolver_cargo_jefatura_id(np.nan, ESC_22))
        self.assertIsNone(self.c.resolver_cargo_jefatura_id(float("nan"), ESC_22))

    def test_pg_sin_escalafon22_resuelve_none(self):
        # Si el escalafón 22 no está cargado, P/G no puede resolver → None.
        self.c._escalafon_id_22 = None
        self.assertIsNone(
            self.c.resolver_cargo_jefatura_id("P02", escalafon_id_fila=ESC_83)
        )

    def test_jcat_case_insensitive(self):
        # El lookup normaliza a upper → 'p02' resuelve igual que 'P02'.
        self.assertEqual(
            self.c.resolver_cargo_jefatura_id("p02", escalafon_id_fila=None),
            PID_JEFE_DEPTO_22,
        )


class SinNivelTest(unittest.TestCase):
    def test_quita_sufijo_nivel(self):
        self.assertEqual(_sin_nivel("Jefe de Departamento (02)"), "jefe de departamento")

    def test_sin_sufijo_igual_norm(self):
        self.assertEqual(_sin_nivel("Jefe de Sección"), _norm("Jefe de Sección"))

    def test_none_y_vacio(self):
        self.assertEqual(_sin_nivel(None), "")
        self.assertEqual(_sin_nivel(""), "")


class _CatalogoFake:
    """Catálogo mínimo para el test del contrato de pipeline (sin DB)."""

    def __init__(self, mapping):
        self._mapping = mapping

    def resolver_cargo_jefatura_id(self, jcat, escalafon_id_fila):
        if jcat is None or (isinstance(jcat, float) and pd.isna(jcat)):
            return None
        return self._mapping.get(str(jcat).strip().upper())


class PipelineContratoFKTest(unittest.TestCase):
    """Verifica el contrato de la columna FK: va a los tres sets de salida y es
    excluida del Excel descargable (pero no de los datos que viajan a Node)."""

    def test_columna_en_los_tres_sets(self):
        self.assertIn("cargo_jefatura_puesto_id", pipeline._ORDEN_SALIDA)
        self.assertIn("cargo_jefatura_puesto_id", pipeline._COLUMNAS_INTERNAS_EXPORT)
        self.assertIn("cargo_jefatura_puesto_id", pipeline._COLUMNAS_NO_MINUSCULA)

    def test_excel_excluye_fk_pero_conserva_texto(self):
        # df_a_excel_bytes debe DROPear la FK (interna) pero conservar
        # cargo_jefatura (texto, Opción A) que no es interno.
        df = pd.DataFrame(
            {
                "id_sial": ["001-1", "002-1"],
                "cargo_jefatura": ["jefe de departamento", None],
                "cargo_jefatura_puesto_id": [PID_JEFE_DEPTO_22, None],
            }
        )
        buf = pipeline.df_a_excel_bytes(df)
        self.assertIsInstance(buf, (bytes, bytearray))
        # Releer el Excel y comprobar columnas.
        import io

        reread = pd.read_excel(io.BytesIO(buf))
        self.assertIn("cargo_jefatura", reread.columns)
        self.assertNotIn("cargo_jefatura_puesto_id", reread.columns)

    def test_resolucion_por_fila_y_conteo_sin_fk(self):
        # Replica la lógica del bloque Opción B de _procesar_lineal sobre un df
        # pequeño: FK poblada donde resuelve, None donde no, y jcat_sin_fk cuenta
        # las filas con JCAT real pero sin FK (AC-1/AC-4).
        cat = _CatalogoFake({"P02": PID_JEFE_DEPTO_22})
        jcat_series = pd.Series(["P02", "Z02", None, "0"])
        escalafon_ids = pd.Series([ESC_22, ESC_83, ESC_22, ESC_22])

        cargo_jef_ids = [
            cat.resolver_cargo_jefatura_id(j, esc_id)
            for j, esc_id in zip(jcat_series, escalafon_ids)
        ]
        self.assertEqual(cargo_jef_ids[0], PID_JEFE_DEPTO_22)  # P02 resuelve
        self.assertIsNone(cargo_jef_ids[1])                    # Z02 → None
        self.assertIsNone(cargo_jef_ids[2])                    # None → None

        jcat_sin_fk = sum(
            1
            for j, c in zip(jcat_series, cargo_jef_ids)
            if j is not None
            and not (isinstance(j, float) and pd.isna(j))
            and str(j).strip()
            and c is None
        )
        # Z02 y '0' tienen valor pero sin FK → 2. (None no cuenta.)
        self.assertEqual(jcat_sin_fk, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
