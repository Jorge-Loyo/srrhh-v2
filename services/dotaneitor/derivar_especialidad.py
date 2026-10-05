# -*- coding: utf-8 -*-
"""
Derivación de especialidad desde el nombre del puesto, para cargos NO médicos.

Gemelo en Python de apps/api/src/modules/padron/derivarEspecialidadPuesto.ts
(misma regla, mismas exclusiones). Se usa en el pipeline del Dotaneitor para
completar la columna `especialidad` ANTES de generar el Excel y de resolver el
especialidad_puesto_id contra el catálogo — así el Excel descargable y la BD
quedan con la especialidad poblada para los no médicos en una sola pasada.

Contexto (2026-10): el padrón trae especialidad solo para médicos. Para los no
médicos la especialidad está determinada por el puesto mismo (enfermero ->
enfermeria, tecnico en radiologia -> su propia especialidad). Para los médicos
genéricos (medico de planta, guardia medico) NO es derivable (dos médicos de
planta pueden ser cardiólogo y pediatra) -> quedan sin especialidad. Conducción
(jefe/director/gerente) no tiene especialidad clínica.

Devuelve minúscula sin tilde, consistente con la regla de la app.
"""
import re

_TABLA_SIN_TILDE = str.maketrans('áéíóúÁÉÍÓÚ', 'aeiouAEIOU')


def _norm(s):
    """Minúscula sin tilde, espacios colapsados. No toca 'ñ'."""
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s).translate(_TABLA_SIN_TILDE).lower()).strip()


def _es_medico_generico(p):
    # medico de planta / guardia medico / profesional guardia medico /
    # especialista en la guardia medico. El veterinario queda FUERA (es
    # veterinaria, especialidad propia determinada por el puesto).
    if 'veterinario' in p:
        return False
    return (
        re.search(r'\bmedico\b', p) is not None
        or 'profesional guardia medico' in p
        or 'especialista en la guardia medico' in p
    )


def _es_conduccion(p):
    return (
        re.search(r'\bjefe de (seccion|unidad|division|departamento)\b', p) is not None
        or re.match(r'^director\b', p) is not None
        or p.startswith('director general')
        or p.startswith('sub-director')
        or p.startswith('subsecretario')
        or p == 'ministro'
        or re.search(r'\bgerente operativo\b', p) is not None
        or re.search(r'\bsubgerente operativo\b', p) is not None
        or p.startswith('vicedirector')
        or p.startswith('director inst')
        or p.startswith('director gral')
    )


def _es_comodin(p):
    return (
        p in ('no aplica', 'personal transitorio', 'pt modulo operativo',
              'planta gabinete transitorio', 'personal de gabinete', 'suplente de guardia')
        or re.match(r'^\d(ro|do|er|to)?\.?\s*(y\s*\d(ro|do|er|to)?\.?)?\s*año', p) is not None
    )


def derivar_especialidad_desde_puesto(nombre_puesto):
    """Deriva la especialidad (minúscula sin tilde) desde el nombre del puesto.
    Devuelve None si no es derivable (médico genérico, conducción, comodín, vacío)."""
    if not nombre_puesto:
        return None
    p = _norm(nombre_puesto)
    if not p:
        return None

    if _es_medico_generico(p) or _es_conduccion(p) or _es_comodin(p):
        return None

    # Enfermería: todas las variantes a una sola especialidad.
    if 'enfermer' in p:
        return 'enfermeria'

    # Recorta sufijos de modalidad/situación y códigos de nivel.
    base = p
    base = re.sub(r'\s*\(\d+\)\s*$', '', base)                 # "(05)", "(06)"
    base = re.sub(r'\s+de\s+(planta|guardia)\b.*$', '', base)  # "de planta", "de guardia..."
    base = re.sub(r'\s+(de|en)\s+la\s+guardia\b.*$', '', base)
    base = re.sub(r'\s+profesional\b', '', base)
    base = re.sub(r'^lic\.\s+en\s+', 'licenciado en ', base)   # unifica "lic." / "licenciado"
    base = base.strip()

    return base or None
