"""
Consolidacion de LIT_PUESTO: puestos que son el mismo cargo pero con errores de tipeo,
terminologia distinta o texto de mas. Los datos viven en ref_correcciones_lit_puesto (BD).
Llamar cargar_tablas_ref(engine) desde main.py al arrancar para cargarlos.
"""
import re

# Fallback hardcodeado — se sobreescribe con cargar_tablas_ref(engine).
MAPEO_LIT_PUESTO_DIRECTO = {
    'FARMACIA': 'Técnico en Farmacia',
    'LABORATORIO': 'Técnico en Laboratorio',
    'LABORATORIO DE PATOLOGIA': 'Técnico en Laboratorio de Patología',
    'ESTERILIZACION': 'Técnico en Esterilización',
    'NECROPSIA': 'Técnico en Necropsia',
    'PRACTICAS CARDIOLOGICAS': 'Técnico en Prácticas Cardiológicas',
    'ASISTENCIA DENTAL': 'Técnico en Asistencia Dental',
    'HEMOTERAPIA': 'Técnico en Hemoterapia',
    'RADIOLOGIA': 'Técnico en Radiología',
    'NUTRICIONISTA DIETISTA DE PLANTA': 'Nutricionista de Planta',
    'NUTRICIONISTA DIETISTA DE GUARDIA': 'Nutricionista de Guardia',
    'LIC. EN NUTRICION DE GUARDIA': 'Lic. en Nutrición de Guardia',
    'KINESIOLOGO FISIATRA DE GUARDIA': 'Kinesiologo de Guardia',
    'KINESIOLOGO FISIATRA DE PLANTA': 'Kinesiologo de Planta',
    'LIC. KINESIOLOGIA DE GUARDIA': 'Lic. en Kinesiología de Guardia',
    'LIC. KINESIOLOGIA DE PLANTA': 'Lic. en Kinesiología de Planta',
    'LIC. BIOQUIMICO DE GUARDIA': 'Lic. en Bioquímica de Guardia',
    'LIC. BIOQUIMICO DE PLANTA': 'Lic. en Bioquímica de Planta',
    'LIC. EN PSICOLOGIA DE GUARDIA': 'Lic. en Psicología de Guardia',
    'LIC. EN PSICOPEDAGOGIA DE GUARDIA': 'Lic. en Psicopedagogía de Guardia',
    'LICENCIADO EN PSICOLOGIA / PSICOLOGO': 'Lic. en Psicología de Planta',
    'LIC. EN SERVICIO SOCIAL SALUD DE PLANTA': 'Lic. en Servicio Social de Planta',
    'LIC. EN CIENCIAS EDUC. DE PLANTA': 'Lic. en Ciencias de la Educ. de Planta',
    'LIC. EN COMUNICACION SOCIAL O EN CS.DE LA COMUNICACION': 'Lic. en Comunicación Social',
    'LICENCIADO EN COMUNICACION SOCIAL': 'Lic. en Comunicación Social',
    'OPERADOR CONVIVENCIAL EN NINÑEZ Y/O ADOLESCENCIA': 'Operador Convivencial en Niñez y/o Adolescencia',
    'ANALISTA DE CONTROL DE GESTION OPERATIVOADMINISTRATIVA': 'Analista de Control de Gestión Operativo Administrativa',
}

MAPEO_LIT_PUESTO_POR_COD_REG = {
    'MEDICO': {'23': 'Suplente de Guardia'},
    'MEDICO VETERINARIO': {'37': 'Medico Veterinario de Planta'},
    'LICENCIADO EN KINESIOLOGIA': {'37': 'Lic. en Kinesiología de Planta', '23': 'Lic. en Kinesiología de Guardia'},
    'LIC. EN KINESIOLOGIA': {'37': 'Lic. en Kinesiología de Planta', '23': 'Lic. en Kinesiología de Guardia'},
    'LIC. EN TERAPIA OCUPACIONAL': {'37': 'Lic. en Terapia Ocupacional de Planta'},
}


def cargar_tablas_ref(engine):
    """Carga MAPEO_LIT_PUESTO_DIRECTO y MAPEO_LIT_PUESTO_POR_COD_REG desde Postgres."""
    global MAPEO_LIT_PUESTO_DIRECTO, MAPEO_LIT_PUESTO_POR_COD_REG
    from sqlalchemy import text
    directo = {}
    por_cod_reg = {}
    with engine.connect() as conn:
        rows = conn.execute(text(
            'SELECT cod_reg, original, correccion FROM ref_correcciones_lit_puesto WHERE activo = true'
        ))
        for cod_reg, original, correccion in rows:
            clave = original.strip().upper()
            if cod_reg is None:
                directo[clave] = correccion
            else:
                if clave not in por_cod_reg:
                    por_cod_reg[clave] = {}
                por_cod_reg[clave][str(cod_reg)] = correccion
    MAPEO_LIT_PUESTO_DIRECTO = directo
    MAPEO_LIT_PUESTO_POR_COD_REG = por_cod_reg


# Regla genérica: "JEFE X" (sin "de") → "Jefe de X"
_PATRON_JEFE_SIN_DE = re.compile(r'^jefe\s+(?!de\b)(.+)$', re.IGNORECASE)


def normalizar_lit_puesto(valor, cod_reg):
    """Consolida variantes de LIT_PUESTO a una denominacion unica."""
    if not isinstance(valor, str) or not valor.strip():
        return valor

    clave = valor.strip().upper()

    opciones_por_cod_reg = MAPEO_LIT_PUESTO_POR_COD_REG.get(clave)
    if opciones_por_cod_reg is not None:
        cod = str(cod_reg).strip() if cod_reg is not None and str(cod_reg) != 'nan' else None
        if cod in opciones_por_cod_reg:
            return opciones_por_cod_reg[cod]
        return valor

    if clave in MAPEO_LIT_PUESTO_DIRECTO:
        return MAPEO_LIT_PUESTO_DIRECTO[clave]

    m = _PATRON_JEFE_SIN_DE.match(valor.strip())
    if m:
        return 'Jefe de ' + m.group(1)

    return valor
