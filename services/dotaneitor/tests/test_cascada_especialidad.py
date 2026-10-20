"""
Tests Bug A — cascada de completado de especialidad vacía (POR ROL / POR CUIL).

Cubre:
  - _resolver_especialidad_unica: ambigüedad -> None (ya NO la más frecuente).
  - buscar_especialidad_por_rol (paso 2): última conocida del mismo rol.
  - _clave_rol: contrato de la clave canónica (strip + guiones del tramo CUIL).
  - Cascada por fila replicando el bloque de pipeline 9.7c sobre un df chico,
    estilo PipelineContratoFKTest (sin DB): padrón trae esp -> respeta; vacía +
    histórico del rol -> completa por rol; vacía + sin rol + CUIL único ->
    completa por CUIL; vacía + sin rol + CUIL ambiguo -> vacío (caso Sargenti);
    vacía + no médico derivable -> deriva por puesto, no entra a la cascada.

Se usa unittest (stdlib) porque este servicio no trae pytest. Correr:
  python -m unittest tests.test_cascada_especialidad   (desde services/dotaneitor)
  python tests/test_cascada_especialidad.py            (runner directo)

El consolidador se instancia con __new__ y se setean lookups/lookups_por_rol en
memoria a mano: no toca la BD.
"""
from __future__ import annotations

import os
import sys
import unittest

import pandas as pd

# Permitir importar los módulos del servicio tanto desde la carpeta del servicio
# como desde la raíz del repo.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from especialidades import (  # noqa: E402
    ConsolidadorEspecialidades,
    _clave_rol,
    _resolver_especialidad_unica,
    SIN_ESPECIALIDAD,
)
from derivar_especialidad import derivar_especialidad_desde_puesto  # noqa: E402


# ── Constantes ────────────────────────────────────────────────────────────────
COD_REG_RESIDENTES = '24'


class ResolverEspecialidadUnicaTest(unittest.TestCase):
    """Paso 3 (por CUIL): entre vacío y una ajena, vacío."""

    def test_una_sola_real(self):
        self.assertEqual(
            _resolver_especialidad_unica(['Cardiologia']), 'Cardiologia'
        )

    def test_dos_reales_distintas_devuelve_none(self):
        # Ambigüedad: antes elegía la más frecuente; ahora None (no hereda ajena).
        self.assertIsNone(
            _resolver_especialidad_unica(['Cardiologia', 'Cardiologia', 'Pediatria'])
        )

    def test_varias_sin_especialidad_y_una_real_devuelve_la_real(self):
        self.assertEqual(
            _resolver_especialidad_unica([SIN_ESPECIALIDAD, 'Urologia', SIN_ESPECIALIDAD]),
            'Urologia',
        )

    def test_solo_sin_especialidad_devuelve_placeholder(self):
        # Todas 'Sin Especialidad' -> devuelve el placeholder, que buscar_especialidad
        # trata como vacío (None). El resultado efectivo para el consumidor es vacío.
        self.assertEqual(
            _resolver_especialidad_unica([SIN_ESPECIALIDAD, SIN_ESPECIALIDAD]),
            SIN_ESPECIALIDAD,
        )

    def test_lista_vacia_devuelve_none(self):
        self.assertIsNone(_resolver_especialidad_unica([]))

    def test_nan_devuelve_none(self):
        self.assertIsNone(_resolver_especialidad_unica([float('nan')]))


class ClaveRolTest(unittest.TestCase):
    """Contrato de la clave canónica compartida por ambos lados del join."""

    def test_cuil_sin_guiones_identico(self):
        self.assertEqual(_clave_rol('20041403218-1'), '20041403218-1')

    def test_cuil_con_guiones_se_limpia(self):
        # El último guion separa el rol; los guiones del tramo CUIL se quitan.
        self.assertEqual(_clave_rol('20-04140321-8-1'), '20041403218-1')

    def test_espacio_al_frente_se_trimea(self):
        self.assertEqual(_clave_rol(' 20188053085-1'), '20188053085-1')

    def test_rol_de_varios_digitos(self):
        self.assertEqual(_clave_rol('20140138216-13'), '20140138216-13')

    def test_sin_guion_devuelve_tal_cual_trim(self):
        self.assertEqual(_clave_rol('  20041403218 '), '20041403218')


class BuscarEspecialidadPorRolTest(unittest.TestCase):
    """Paso 2 (por ROL): última conocida; NO se anula por ambigüedad."""

    def _consolidador(self, lookups_por_rol):
        c = ConsolidadorEspecialidades.__new__(ConsolidadorEspecialidades)
        c.lookups = {}
        c.lookups_por_rol = lookups_por_rol
        c.reporte = {}
        return c

    def test_rol_presente_devuelve_su_especialidad(self):
        c = self._consolidador({COD_REG_RESIDENTES: {'27368625057-6': 'Cirugia Plastica Y Reparadora'}})
        self.assertEqual(
            c.buscar_especialidad_por_rol('27368625057-6', COD_REG_RESIDENTES),
            'Cirugia Plastica Y Reparadora',
        )

    def test_rol_presente_con_cuil_con_guiones_normaliza(self):
        c = self._consolidador({COD_REG_RESIDENTES: {'27368625057-6': 'Cirugia Plastica Y Reparadora'}})
        # La clave del lookup está normalizada; la consulta tolera guiones/espacios.
        self.assertEqual(
            c.buscar_especialidad_por_rol('27-36862505-7-6', COD_REG_RESIDENTES),
            'Cirugia Plastica Y Reparadora',
        )

    def test_rol_ausente_devuelve_none(self):
        c = self._consolidador({COD_REG_RESIDENTES: {'27368625057-6': 'Cirugia Plastica Y Reparadora'}})
        self.assertIsNone(c.buscar_especialidad_por_rol('99999999999-1', COD_REG_RESIDENTES))

    def test_cod_reg_sin_base_devuelve_none(self):
        c = self._consolidador({COD_REG_RESIDENTES: {'27368625057-6': 'Cirugia Plastica Y Reparadora'}})
        self.assertIsNone(c.buscar_especialidad_por_rol('27368625057-6', '99'))

    def test_valor_sin_especialidad_devuelve_none(self):
        c = self._consolidador({COD_REG_RESIDENTES: {'27368625057-6': SIN_ESPECIALIDAD}})
        self.assertIsNone(c.buscar_especialidad_por_rol('27368625057-6', COD_REG_RESIDENTES))

    def test_cuil_y_rol_none_devuelve_none(self):
        c = self._consolidador({COD_REG_RESIDENTES: {'27368625057-6': 'Cirugia Plastica Y Reparadora'}})
        self.assertIsNone(c.buscar_especialidad_por_rol(None, COD_REG_RESIDENTES))


class DedupPorRolUltimaConocidaTest(unittest.TestCase):
    """H3: mismo cuil_y_rol con 2 reales distintas -> la ÚLTIMA (keep='last'), NO None.

    Replica la construcción del lookup POR ROL de ConsolidadorEspecialidadesBD.cargar
    sobre un df chico, para verificar que un dato sucio en el mismo rol no borra la
    especialidad del rol."""

    def test_dos_reales_mismo_rol_toma_la_ultima(self):
        sub = pd.DataFrame({
            'Cuil y Rol': ['27368625057-6', '27368625057-6'],
            'ESPECIALIDAD UNIF.': ['Bioquimica Clinica', 'Cirugia Plastica Y Reparadora'],
        })
        sub['CUIL_Y_ROL_NORM'] = sub['Cuil y Rol'].map(_clave_rol)
        por_rol = sub.drop_duplicates(subset='CUIL_Y_ROL_NORM', keep='last')
        lookup = dict(zip(por_rol['CUIL_Y_ROL_NORM'], por_rol['ESPECIALIDAD UNIF.']))
        self.assertEqual(lookup['27368625057-6'], 'Cirugia Plastica Y Reparadora')


class _CatalogoFake:
    """Catálogo mínimo sin DB para replicar la resolución por fila de 9.7c."""

    def resolver_escalafon(self, cod_reg):
        return 'esc-' + str(cod_reg)

    def resolver_puesto(self, esc_id, lit_puesto):
        return 'pue-' + str(lit_puesto)

    def resolver_especialidad(self, pue_id, esp_val):
        # Devuelve un id ficticio solo si hay especialidad; None si quedó vacía.
        if esp_val is None or (isinstance(esp_val, float) and pd.isna(esp_val)) or str(esp_val).strip() == '':
            return None
        return 'esp-' + str(esp_val)


class _ConsolidadorFake:
    """Expone buscar_especialidad_por_rol / buscar_especialidad desde dicts en memoria."""

    def __init__(self, por_rol, por_cuil):
        self._por_rol = por_rol    # {cuil_y_rol_norm: esp}
        self._por_cuil = por_cuil  # {cuil_str: esp or None (ambiguo)}

    def buscar_especialidad_por_rol(self, cuil_y_rol, cod_reg):
        if cuil_y_rol is None:
            return None
        return self._por_rol.get(_clave_rol(cuil_y_rol))

    def buscar_especialidad(self, cuil, cod_reg):
        if cuil is None or pd.isna(cuil):
            return None
        return self._por_cuil.get(str(cuil).strip())


def _resolver_fila(cod_reg, lit_puesto, esp, cuil_y_rol_fila, cuil_fila, catalogo, consolidador):
    """Replica EXACTAMENTE el orden efectivo de pipeline 9.7c (paso 1 padrón,
    derivación previa no médicos, paso 2 rol, paso 3 CUIL, paso 4 vacío).
    Devuelve (esp_val, esp_id, origen) donde origen ∈
    {padron, derivacion, rol, cuil, vacio}."""
    esp_vacia = esp is None or (isinstance(esp, float) and pd.isna(esp)) or str(esp).strip() == ''
    esp_val = esp
    origen = 'padron'
    if esp_vacia:
        esp_val = derivar_especialidad_desde_puesto(lit_puesto)
        origen = 'derivacion' if esp_val is not None else 'vacio'
        if esp_val is None and consolidador is not None:
            esp_rol = consolidador.buscar_especialidad_por_rol(cuil_y_rol_fila, cod_reg)
            if esp_rol is not None:
                esp_val, origen = esp_rol, 'rol'
            else:
                esp_cuil = consolidador.buscar_especialidad(cuil_fila, cod_reg)
                if esp_cuil is not None:
                    esp_val, origen = esp_cuil, 'cuil'
                else:
                    origen = 'vacio'
    esp_id = catalogo.resolver_especialidad('pue', esp_val)
    return esp_val, esp_id, origen


class CascadaPorFilaTest(unittest.TestCase):
    def setUp(self):
        self.cat = _CatalogoFake()
        self.cons = _ConsolidadorFake(
            por_rol={'27368625057-6': 'Cirugia Plastica Y Reparadora'},
            por_cuil={
                '30111111111': 'Urologia',   # CUIL con una sola -> no ambiguo
                '30222222222': None,          # CUIL ambiguo -> None (no elige)
            },
        )

    def test_paso1_padron_trae_especialidad_se_respeta(self):
        esp_val, esp_id, origen = _resolver_fila(
            COD_REG_RESIDENTES, 'Medico de Planta', 'Pediatria',
            '30111111111-1', 30111111111, self.cat, self.cons,
        )
        self.assertEqual(esp_val, 'Pediatria')
        self.assertEqual(origen, 'padron')

    def test_paso2_vacia_con_historico_de_rol_se_completa_por_rol(self):
        # Caso Sargenti RESUELTO: rol conocido -> toma la del rol (cirugía plástica),
        # NO la de otro rol de la persona.
        esp_val, esp_id, origen = _resolver_fila(
            COD_REG_RESIDENTES, 'Medico de Planta', None,
            '27368625057-6', 27368625057, self.cat, self.cons,
        )
        self.assertEqual(esp_val, 'Cirugia Plastica Y Reparadora')
        self.assertEqual(origen, 'rol')

    def test_paso3_vacia_sin_rol_cuil_unico_se_completa_por_cuil(self):
        esp_val, esp_id, origen = _resolver_fila(
            COD_REG_RESIDENTES, 'Medico de Planta', None,
            '30111111111-9', 30111111111, self.cat, self.cons,
        )
        self.assertEqual(esp_val, 'Urologia')
        self.assertEqual(origen, 'cuil')

    def test_paso4_vacia_sin_rol_cuil_ambiguo_queda_vacia(self):
        # Caso Sargenti (variante ambigua): CUIL con 2 especialidades -> NO elige ninguna.
        esp_val, esp_id, origen = _resolver_fila(
            COD_REG_RESIDENTES, 'Medico de Planta', None,
            '30222222222-9', 30222222222, self.cat, self.cons,
        )
        self.assertIsNone(esp_val)
        self.assertIsNone(esp_id)
        self.assertEqual(origen, 'vacio')

    def test_no_medico_derivable_deriva_por_puesto_no_entra_cascada(self):
        # Enfermero con especialidad vacía -> deriva por puesto ('enfermeria'),
        # NO consulta el histórico del rol ni el CUIL.
        esp_val, esp_id, origen = _resolver_fila(
            COD_REG_RESIDENTES, 'Enfermero de Planta', None,
            '27368625057-6', 27368625057, self.cat, self.cons,
        )
        self.assertEqual(esp_val, 'enfermeria')
        self.assertEqual(origen, 'derivacion')

    def test_sin_consolidador_vacia_queda_vacia(self):
        # Sin consolidador (compatibilidad): médico con esp vacía -> queda vacía.
        esp_val, esp_id, origen = _resolver_fila(
            COD_REG_RESIDENTES, 'Medico de Planta', None,
            '27368625057-6', 27368625057, self.cat, None,
        )
        self.assertIsNone(esp_val)
        self.assertEqual(origen, 'vacio')


if __name__ == '__main__':
    unittest.main(verbosity=2)
