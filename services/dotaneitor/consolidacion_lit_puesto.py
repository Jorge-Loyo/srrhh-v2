"""
Consolidacion de LIT_PUESTO: puestos que son el mismo cargo pero con errores de tipeo,
terminologia distinta o texto de mas (variantes descubiertas y confirmadas a mano contra los
datos reales de Cargos_Salud, en conjunto con el usuario).

Las claves de los diccionarios se comparan en MAYUSCULA, sin espacios de borde, contra el valor
ORIGINAL de LIT_PUESTO (antes de pasar por Formato Titulo), asi no importa como venga
capitalizado en el dato fuente.

Este modulo se importa desde normalizador_cargos.py y se aplica como un paso propio sobre la
columna LIT_PUESTO, antes del paso generico de Formato Titulo + tildes (que igual es seguro
correr despues, ya que los valores de reemplazo ya vienen con el formato final correcto).
"""
import re

# Mapeo directo: mismo resultado final sin importar el Codigo de Registro (COD_REG).
MAPEO_LIT_PUESTO_DIRECTO = {
    # Nombre de tecnica/especialidad suelto (todos con COD_REG 85) -> "Tecnico en X"
    'FARMACIA': 'Técnico en Farmacia',
    'LABORATORIO': 'Técnico en Laboratorio',
    'LABORATORIO DE PATOLOGIA': 'Técnico en Laboratorio de Patología',
    'ESTERILIZACION': 'Técnico en Esterilización',
    'NECROPSIA': 'Técnico en Necropsia',
    'PRACTICAS CARDIOLOGICAS': 'Técnico en Prácticas Cardiológicas',
    'ASISTENCIA DENTAL': 'Técnico en Asistencia Dental',
    'HEMOTERAPIA': 'Técnico en Hemoterapia',
    'RADIOLOGIA': 'Técnico en Radiología',

    # Nutricion: sacar "Dietista" (redundante)
    'NUTRICIONISTA DIETISTA DE PLANTA': 'Nutricionista de Planta',
    'NUTRICIONISTA DIETISTA DE GUARDIA': 'Nutricionista de Guardia',
    'LIC. EN NUTRICION DE GUARDIA': 'Lic. en Nutrición de Guardia',

    # Kinesiologia: sacar "Fisiatra" (redundante) / normalizar "Lic." variantes
    'KINESIOLOGO FISIATRA DE GUARDIA': 'Kinesiologo de Guardia',
    'KINESIOLOGO FISIATRA DE PLANTA': 'Kinesiologo de Planta',
    'LIC. KINESIOLOGIA DE GUARDIA': 'Lic. en Kinesiología de Guardia',
    'LIC. KINESIOLOGIA DE PLANTA': 'Lic. en Kinesiología de Planta',

    # Bioquimica: "Lic. Bioquimico" -> "Lic. en Bioquimica" (concordancia)
    'LIC. BIOQUIMICO DE GUARDIA': 'Lic. en Bioquímica de Guardia',
    'LIC. BIOQUIMICO DE PLANTA': 'Lic. en Bioquímica de Planta',

    # Psicologia / Psicopedagogia: normalizar "Lic. en"
    'LIC. EN PSICOLOGIA DE GUARDIA': 'Lic. en Psicología de Guardia',
    'LIC. EN PSICOPEDAGOGIA DE GUARDIA': 'Lic. en Psicopedagogía de Guardia',
    'LICENCIADO EN PSICOLOGIA / PSICOLOGO': 'Lic. en Psicología de Planta',

    # Servicio social / Ciencias de la educacion: sacar texto redundante
    'LIC. EN SERVICIO SOCIAL SALUD DE PLANTA': 'Lic. en Servicio Social de Planta',
    'LIC. EN CIENCIAS EDUC. DE PLANTA': 'Lic. en Ciencias de la Educ. de Planta',

    # Comunicacion social: dos formas del mismo puesto -> una sola
    'LIC. EN COMUNICACION SOCIAL O EN CS.DE LA COMUNICACION': 'Lic. en Comunicación Social',
    'LICENCIADO EN COMUNICACION SOCIAL': 'Lic. en Comunicación Social',

    # Errores de tipeo confirmados a mano
    'OPERADOR CONVIVENCIAL EN NINÑEZ Y/O ADOLESCENCIA': 'Operador Convivencial en Niñez y/o Adolescencia',
    'ANALISTA DE CONTROL DE GESTION OPERATIVOADMINISTRATIVA': 'Analista de Control de Gestión Operativo Administrativa',
}

# Mapeo que depende del Codigo de Registro (COD_REG): mismo valor de origen, distinto destino
# segun el codigo. Las claves de adentro son el COD_REG como string ("23" = Guardia, "37" = Planta).
MAPEO_LIT_PUESTO_POR_COD_REG = {
    'MEDICO': {'23': 'Suplente de Guardia'},
    'MEDICO VETERINARIO': {'37': 'Medico Veterinario de Planta'},
    'LICENCIADO EN KINESIOLOGIA': {
        '37': 'Lic. en Kinesiología de Planta',
        '23': 'Lic. en Kinesiología de Guardia',
    },
    'LIC. EN KINESIOLOGIA': {
        '37': 'Lic. en Kinesiología de Planta',
        '23': 'Lic. en Kinesiología de Guardia',
    },
    'LIC. EN TERAPIA OCUPACIONAL': {'37': 'Lic. en Terapia Ocupacional de Planta'},
}

# "JEFE X" (sin "de") -> "Jefe de X". Regla generica (no una lista fija) para cubrir cargos de
# jefatura nuevos que puedan aparecer en el futuro, no solo los 4 que existen hoy
# (Departamento, Division, Seccion, Unidad). "JEFE DE RESIDENTES" ya tiene "de" y no matchea.
_PATRON_JEFE_SIN_DE = re.compile(r'^jefe\s+(?!de\b)(.+)$', re.IGNORECASE)


def normalizar_lit_puesto(valor, cod_reg):
    """Consolida variantes de LIT_PUESTO que son el mismo puesto (errores de tipeo, terminologia
    vieja, texto de mas) a una denominacion unica. Devuelve el valor sin tocar si no matchea
    ninguna regla conocida."""
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
