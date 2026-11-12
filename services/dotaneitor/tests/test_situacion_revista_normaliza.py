"""
Tests — normalización de `situacion_de_revista` a minúscula-sin-tilde (candado
del desglose de dotación por situación de revista, /reportes).

Contexto: el desglose de dotación por situación de revista depende de un catálogo
CERRADO de 3 estados normalizados — {'activo', 'comision', 'retencion de cargo'}.
El productor REAL es el paso 9.75 de pipeline.procesar_padron, que mapea
`minuscula_sin_tilde` sobre todas las columnas salvo las de `_COLUMNAS_NO_MINUSCULA`.
`situacion_de_revista` NO está (ni debe estar) en ese set — este test es el candado
que lo garantiza: si alguien agregara la columna al set, el DataFrame dejaría de
caer en el catálogo cerrado y este test fallaría.

Cubre:
  - minuscula_sin_tilde sobre las 6 variantes conocidas del padrón
    ('Activo','activo','Comisión','comision','Retencion de Cargo',
    'retencion de cargo') → exactamente {'activo','comision','retencion de cargo'}.
  - Réplica del paso 9.75 sobre un DataFrame de muestra: situacion_de_revista queda
    dentro del catálogo cerrado, y la columna NO está en _COLUMNAS_NO_MINUSCULA.

Se usa unittest (stdlib) porque este servicio no trae pytest. Correr:
  python -m unittest tests.test_situacion_revista_normaliza   (desde services/dotaneitor)
  python tests/test_situacion_revista_normaliza.py            (runner directo)
"""
from __future__ import annotations

import os
import sys
import unittest

import pandas as pd

# Permitir importar los módulos del servicio tanto desde la carpeta del servicio
# como desde la raíz del repo (mismo patrón que tests/test_cascada_especialidad.py).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline import minuscula_sin_tilde, _COLUMNAS_NO_MINUSCULA  # noqa: E402


# Las 6 variantes crudas que el padrón trae históricamente (casing + tilde).
VARIANTES_CONOCIDAS = [
    'Activo', 'activo',
    'Comisión', 'comision',
    'Retencion de Cargo', 'retencion de cargo',
]

# Catálogo CERRADO de estados tras normalizar (minúscula, sin tilde).
CATALOGO_CERRADO = {'activo', 'comision', 'retencion de cargo'}


class MinusculaSinTildeTest(unittest.TestCase):
    """Las 6 variantes conocidas colapsan al catálogo cerrado de 3 estados."""

    def test_variantes_conocidas_caen_en_catalogo_cerrado(self):
        normalizadas = {minuscula_sin_tilde(v) for v in VARIANTES_CONOCIDAS}
        self.assertEqual(normalizadas, CATALOGO_CERRADO)

    def test_cada_variante_concreta(self):
        casos = {
            'Activo': 'activo',
            'activo': 'activo',
            'Comisión': 'comision',
            'comision': 'comision',
            'Retencion de Cargo': 'retencion de cargo',
            'retencion de cargo': 'retencion de cargo',
        }
        for crudo, esperado in casos.items():
            with self.subTest(crudo=crudo):
                self.assertEqual(minuscula_sin_tilde(crudo), esperado)

    def test_no_toca_no_strings(self):
        # NaN / números pasan tal cual (no fuerza str), como en el paso 9.75.
        self.assertTrue(pd.isna(minuscula_sin_tilde(float('nan'))))
        self.assertEqual(minuscula_sin_tilde(42), 42)


class Paso975CandadoTest(unittest.TestCase):
    """El paso 9.75 (réplica) deja situacion_de_revista dentro del catálogo cerrado,
    y la columna NO está en el set de exclusión (candado)."""

    def test_situacion_de_revista_no_esta_excluida(self):
        # Candado: si alguien la agrega a _COLUMNAS_NO_MINUSCULA, dejaría de
        # normalizarse y reintroduciría variantes de casing/acento.
        self.assertNotIn('situacion_de_revista', _COLUMNAS_NO_MINUSCULA)

    def _aplicar_paso_975(self, df: pd.DataFrame) -> pd.DataFrame:
        """Réplica EXACTA del bucle del paso 9.75 de pipeline.procesar_padron:
        baja a minúscula-sin-tilde todas las columnas salvo las de exclusión."""
        df = df.copy()
        for col in df.columns:
            if col in _COLUMNAS_NO_MINUSCULA:
                continue
            df[col] = df[col].map(minuscula_sin_tilde)
        return df

    def test_dataframe_muestra_queda_en_catalogo_cerrado(self):
        df = pd.DataFrame({
            'situacion_de_revista': VARIANTES_CONOCIDAS,
            # Columna identificadora que NO debe bajarse (control).
            'siglas': ['EAIT', 'DGAH', 'EAIT', 'DGAH', 'EAIT', 'DGAH'],
        })
        out = self._aplicar_paso_975(df)
        self.assertTrue(set(out['situacion_de_revista']).issubset(CATALOGO_CERRADO))
        self.assertEqual(set(out['situacion_de_revista']), CATALOGO_CERRADO)
        # 'siglas' está excluida → NO se baja a minúscula.
        self.assertEqual(list(out['siglas']), ['EAIT', 'DGAH', 'EAIT', 'DGAH', 'EAIT', 'DGAH'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
