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

# Fallback hardcodeado — se sobreescribe con cargar_tablas_ref(engine).
MAPEO_ESPECIALIDAD = {
    'CIRUGIA TORAXICA': 'Cirugía Torácica',
    'PSIQUATRIA': 'Psiquiatría',
    'PSIQUIATRA': 'Psiquiatría',
    'TRABAJO SOCIAL Y SERVICIO SOCIAL': 'Trabajo Social',
}


def cargar_tablas_ref(engine):
    """Carga MAPEO_ESPECIALIDAD desde ref_correcciones_especialidad en Postgres."""
    global MAPEO_ESPECIALIDAD
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text(
            'SELECT original, correccion FROM ref_correcciones_especialidad WHERE activo = true'
        ))
        MAPEO_ESPECIALIDAD = {r[0].strip().upper(): r[1] for r in rows}


def normalizar_especialidad(valor):
    """Consolida variantes de ESPECIALIDAD UNIF. que son la misma especialidad (errores de tipeo
    confirmados a mano). Devuelve el valor sin tocar si no matchea ninguna regla conocida."""
    if not isinstance(valor, str) or not valor.strip():
        return valor

    clave = valor.strip().upper()
    return MAPEO_ESPECIALIDAD.get(clave, valor)
