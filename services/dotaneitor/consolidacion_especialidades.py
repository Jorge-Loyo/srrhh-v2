"""
Consolidacion de ESPECIALIDAD UNIF.: variantes que son la misma especialidad pero con error de
tipeo, confirmadas a mano contra los datos reales (hojas ESPECIALIDADES CPH / SUPLENTES /
RESIDENTES de ARCHIVOS PARA DOTACION.xlsx) junto con el usuario.

Las claves del diccionario se comparan en MAYUSCULA, sin espacios de borde, contra el valor
ORIGINAL de ESPECIALIDAD UNIF. (antes de pasar por Formato Titulo), asi no importa como venga
capitalizado en el dato fuente.

Casos revisados y descartados a proposito (NO se fusionan, quedan como especialidades distintas):
- 'OBSTETRICA' vs 'OBSTETRICIA': confirmado con el usuario que son dos cosas distintas.

Este modulo se importa desde especialidades.py y se aplica como paso previo al Formato Titulo +
tildes (formato_titulo_tecnico), igual que consolidacion_lit_puesto.py para LIT_PUESTO.
"""

MAPEO_ESPECIALIDAD = {
    # Typo de origen: "Toraxica" (con X) en vez de "Toracica" (con C). Confirmado porque
    # Cargos_Salud ya trae el mismo caso bien escrito: LIT_ESP_CARGO = "Cirugía Torácica".
    'CIRUGIA TORAXICA': 'Cirugía Torácica',

    # Errores de tipeo aislados (1 fila cada uno) de la misma especialidad que domina con 248
    # filas en la hoja ESPECIALIDADES SUPLENTES. Confirmado con el usuario.
    'PSIQUATRIA': 'Psiquiatría',
    'PSIQUIATRA': 'Psiquiatría',

    # "Trabajo Social y Servicio Social" (como viene en las hojas de referencia) es la misma
    # especialidad que "Trabajo Social" (como viene directo en Cargos_Salud); confirmado con el
    # usuario. "Servicio Social" sola se dejó a propósito sin fusionar: especialidad distinta.
    'TRABAJO SOCIAL Y SERVICIO SOCIAL': 'Trabajo Social',
}


def normalizar_especialidad(valor):
    """Consolida variantes de ESPECIALIDAD UNIF. que son la misma especialidad (errores de tipeo
    confirmados a mano). Devuelve el valor sin tocar si no matchea ninguna regla conocida."""
    if not isinstance(valor, str) or not valor.strip():
        return valor

    clave = valor.strip().upper()
    return MAPEO_ESPECIALIDAD.get(clave, valor)
