# -*- coding: utf-8 -*-
"""
completar_especialidad_por_agrupador
=====================================

Completa huecos de ESPECIALIDAD para el universo AGRUPADOR = Medico / No medico / cualquier
Residente (residente 1er/2do/3er-4to año básica, post-básica, instructor, jefe). El
UNIFICADOR DE PUESTOS "Suplente de Guardia" no necesita tratamiento aparte: sus filas ya caen
100% dentro de AGRUPADOR Medico/No medico.

A diferencia de especialidades.py (que cruza por CUIL contra las hojas externas de
ARCHIVOS PARA DOTACION.xlsx), este módulo NO usa ningún archivo externo: aprende de los datos
que ya están cargados en el propio Dotacion_procesada.xlsx.

Orden de resolución para cada fila vacía dentro del alcance:
  1. CUIL: si la misma persona ya tiene ESPECIALIDAD cargada en otro cargo (en cualquier parte
     del archivo, no solo dentro del alcance), se copia ese valor. Resuelve pocos casos (~17
     sobre 3.068 en la corrida de referencia) pero es gratis y es la fuente más confiable que hay
     (mismo individuo).
  2. MAPEO_ESPECIALIDAD_POR_PUESTO: diccionario fijo LITERAL PUESTO -> ESPECIALIDAD. La mayoría de
     las entradas se construyeron calculando, para cada LITERAL PUESTO, cuál es la ESPECIALIDAD
     más frecuente entre los cargos de ese mismo puesto que YA tienen el dato cargado (moda
     empírica), incluida en el diccionario cuando esa moda cubre al menos el 80% de los casos de
     referencia ("pureza"). Los puestos sin ningún caso de referencia pero con nombre inequívoco
     (ej. "Fonoaudiólogo de Guardia") también se incluyeron, resueltos por el nombre.

     Se verificó explícitamente (a pedido del usuario) si agrupar por el código interno de PUESTO
     en lugar del texto de LITERAL PUESTO cambiaba la pureza — no cambió en ningún caso de forma
     relevante: la ambigüedad que queda es diversidad real de sub-especialidades (ej. Odontología:
     Odontopediatría, Endodoncia, Ortodoncia conviven bajo el mismo puesto y el mismo código), no
     un artefacto de mezclar puestos distintos.

     También se verificó (a pedido del usuario) si restringir la referencia a solo las filas con
     UNIFICADOR DE PUESTOS "Suplente de Guardia" (Código de Registro 23, 3.743 filas) en vez de
     todo el archivo cambiaba algo — para "Bioquímico de Guardia" y "Odontólogo de Guardia" el
     valor ganador es el mismo, pero la pureza sube fuerte (49.4%→85.1% y 72.6%→90.9%
     respectivamente): la mezcla con Código 37 (CPH) diluía la confianza. No aparecieron puestos
     nuevos con huecos al filtrar así.

     "Odontólogo de Planta" y "Bioquímico de Planta" quedaron con la moda empírica pese a estar
     debajo del umbral del 80% (decisión explícita del usuario, "la especialidad más
     concurrente"). "Profesional Guardia Médico" y "Médico de Planta" (puestos genéricos,
     compatibles con cualquier especialidad médica, sin ninguna moda útil — la más frecuente cubre
     apenas 9-10% de los casos) usan un valor fijo pedido por el usuario: `'Sin Especialidad'`.
     "Especialista en la Guardia Médico" usa otro valor fijo, `'Clínica Médica (Medicina
     Interna)'` — tampoco es la moda (Pediatría lidera con 17.6%), es la especialidad generalista
     elegida a criterio del usuario, igual que "Odontología General" para odontólogos. "Experto en
     Física Radiante de Planta" también es un valor fijo pedido por el usuario (no la moda
     empírica).
  3. Si no matchea ninguno de los dos pasos anteriores, la fila queda sin tocar (no se inventa
     nada) y se registra en el detalle devuelto, para revisión manual. Ver
     PUESTOS_SIN_ESPECIALIDAD_DERIVABLE para lo que queda así hoy.

Nunca pisa un valor de ESPECIALIDAD que ya esté cargado — misma regla que especialidades.py.

NOTA: MAPEO_ESPECIALIDAD_POR_PUESTO se calculó una vez, a mano, sobre un archivo de referencia
puntual — no se recalcula solo en cada corrida. Bug encontrado y corregido en una revisión
posterior: los valores originales de "Asistente/Trabajador Social de Guardia/Planta" se habían
calculado sobre `Dotacion_procesada.xlsx` del 2026-08-03, un día antes de que
`consolidacion_especialidades.py` empezara a normalizar "Trabajo Social y Servicio Social" a
"Trabajo Social" (2026-08-04) — quedaron con el valor viejo, no con el que produce el código
actual. Si en el futuro cambia algo en `especialidades.py` / `consolidacion_especialidades.py` /
`normalizador_cargos.py` que afecte cómo se ve ESPECIALIDAD, vale la pena volver a correr este
diccionario contra una Dotación fresca antes de confiar en los porcentajes de pureza de los
comentarios (que quedan como referencia histórica, no se actualizan solos).

Números de referencia (corrida sobre Cargos_salud_20260802.xlsx + ARCHIVOS PARA DOTACION.xlsx,
46.889 filas, ya con el cruce externo de especialidades.py aplicado antes): alcance total 3.068
cargos vacíos dentro de AGRUPADOR Medico/No medico/Residente. 17 se resuelven por CUIL, 3.050 por
el diccionario de abajo, y queda 1 sin poder derivarse (la fila huérfana "Suplente de Guardia").
"""

import pandas as pd

# Fallback hardcodeado — se sobreescribe con cargar_tablas_ref(engine).
MAPEO_ESPECIALIDAD_POR_PUESTO = {
    'Asistente Social de Guardia': 'Trabajo Social',  # 100.0% pureza sobre 166 casos ya cargados (4 vacios). NO "Trabajo Social y Servicio Social": ese valor lo normaliza consolidacion_especialidades.py a "Trabajo Social" desde el 2026-08-04
    'Asistente Social de Planta': 'Trabajo Social',  # 89.7% pureza sobre 175 casos ya cargados (2 vacios). Mismo criterio que Asistente Social de Guardia
    'Bioquímico de Guardia': 'Bioquímica Clínica sin Especialidad',  # 49.4% pureza global (530 casos), pero 85.1% filtrando solo por UNIFICADOR DE PUESTOS "Suplente de Guardia" (228 casos) — la mezcla con CPH diluía la confianza, mismo valor ganador en los dos casos (59 vacios)
    'Bioquímico de Planta': 'Bioquímica Clínica (Química Clínica)',  # 55.2% pureza sobre 402 casos — bajo el umbral de 80%, pero aprobado explícitamente por el usuario como "la más concurrente" pese a la ambigüedad real entre sub-especialidades (32 vacios)
    'Experto en Física Radiante de Planta': 'Radioterapia (Física Radiante)',  # valor fijo pedido por el usuario, no la moda empírica (que era "Radioterapia (Terapia Radiante)" sobre solo 7 casos) (1 vacio)
    'Farmacéutico de Guardia': 'Farmacia Hospitalaria',  # 99.1% pureza sobre 338 casos ya cargados (31 vacios)
    'Farmacéutico de Planta': 'Farmacia Hospitalaria',  # 97.0% pureza sobre 266 casos ya cargados (36 vacios)
    'Fonoaudiólogo de Guardia': 'Fonoaudiología',  # sin referencia interna, derivado del nombre del puesto (3 vacios)
    'Fonoaudiólogo de Planta': 'Fonoaudiología',  # 99.5% pureza sobre 215 casos ya cargados (29 vacios)
    'Kinesiólogo de Guardia': 'Kinesiología',  # 98.3% pureza sobre 695 casos ya cargados (64 vacios)
    'Kinesiólogo de Planta': 'Kinesiología',  # 98.8% pureza sobre 256 casos ya cargados (12 vacios)
    'Lic. en Kinesiología de Guardia': 'Kinesiología',  # 100.0% pureza sobre 56 casos ya cargados (2 vacios)
    'Lic. en Nutrición de Guardia': 'Lic. en Nutrición',  # 100.0% pureza sobre 3 casos ya cargados (1 vacios)
    'Lic. en Psicología de Guardia': 'Psicología Clínica',  # 100.0% pureza sobre 3 casos ya cargados (3 vacios)
    'Lic. en Psicopedagogía de Guardia': 'Psicopedagogía',  # sin referencia interna, derivado del nombre del puesto (1 vacios)
    'Licenciado en Obstetricia - Obstétrica': 'Obstetricia',  # sin referencia interna, derivado del nombre del puesto (2 vacios)
    'Musicoterapeuta de Planta': 'Musicoterapia',  # 100.0% pureza sobre 22 casos ya cargados (3 vacios)
    'Médico Veterinario de Planta': 'Veterinaria',  # 90.9% pureza sobre 44 casos ya cargados (4 vacios)
    'Médico de Planta': 'Sin Especialidad',  # valor fijo pedido por el usuario: el puesto es compatible con cualquier especialidad médica y no hay forma de derivar cuál, así que se deja constancia explícita en vez de un hueco vacío (28 vacios)
    'Nutricionista de Guardia': 'Lic. en Nutrición',  # 100.0% pureza sobre 9 casos ya cargados (4 vacios)
    'Nutricionista de Planta': 'Lic. en Nutrición',  # 92.1% pureza sobre 239 casos ya cargados (13 vacios)
    'Obstétrica de Guardia': 'Obstétrica',  # 95.0% pureza sobre 302 casos ya cargados (8 vacios)
    'Obstétrica de Planta': 'Obstétrica',  # 93.2% pureza sobre 103 casos ya cargados (2 vacios)
    'Especialista en la Guardia Médico': 'Clínica Médica (Medicina Interna)',  # NO es la moda (Pediatría lidera con 17.6% sobre 1.242 casos, dentro de "Suplente de Guardia"): decisión explícita del usuario de usar la especialidad generalista (medicina interna), igual que "Odontología General" para odontólogos, en vez de un valor sin sentido clínico (81 vacios)
    'Odontólogo de Guardia': 'Odontología General',  # 72.6% pureza global (73 casos), pero 90.9% filtrando solo por UNIFICADOR DE PUESTOS "Suplente de Guardia" (22 casos) — mismo valor ganador en los dos casos (6 vacios)
    'Odontólogo de Planta': 'Odontología General',  # 62.1% pureza sobre 409 casos — bajo el umbral de 80%, pero aprobado explícitamente por el usuario como "la más concurrente" (61 vacios)
    'Profesional Guardia Médico': 'Sin Especialidad',  # valor fijo pedido por el usuario, mismo criterio que Médico de Planta (2429 vacios)
    'Psicopedagogo de Guardia': 'Psicopedagogía',  # sin referencia interna, derivado del nombre del puesto (1 vacios)
    'Psicopedagogo de Planta': 'Psicopedagogía',  # 99.2% pureza sobre 127 casos ya cargados (12 vacios)
    'Psicólogo de Guardia': 'Psicología Clínica',  # 86.4% pureza sobre 279 casos ya cargados (32 vacios)
    'Psicólogo de Planta': 'Psicología Clínica',  # 92.5% pureza sobre 878 casos ya cargados (49 vacios)
    'Terapeuta Ocupacional de Planta': 'Terapia Ocupacional',  # 100.0% pureza sobre 3 casos ya cargados (1 vacios)
    'Terapista Ocupacional de Guardia': 'Terapia Ocupacional',  # sin referencia interna, derivado del nombre del puesto (2 vacios)
    'Terapista Ocupacional de Planta': 'Terapia Ocupacional',  # 97.4% pureza sobre 114 casos ya cargados (11 vacios)
    'Trabajador Social de Guardia': 'Trabajo Social',  # 97.0% pureza sobre 33 casos ya cargados (10 vacios). NO "Trabajo Social y Servicio Social": ver nota en Asistente Social de Guardia
    'Trabajador Social de Planta': 'Trabajo Social',  # 85.8% pureza sobre 218 casos ya cargados (17 vacios). Mismo criterio
    'Técnico en Laboratorio de Análisis Clínicos': 'Laboratorio (Análisis Clínicos)',  # sin referencia interna, derivado del nombre del puesto (1 vacios)
}


def cargar_tablas_ref(engine):
    """Carga MAPEO_ESPECIALIDAD_POR_PUESTO desde ref_especialidad_por_puesto en Postgres."""
    global MAPEO_ESPECIALIDAD_POR_PUESTO, _MAPEO_ESPECIALIDAD_POR_PUESTO_UPPER
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text(
            'SELECT agrupador, especialidad FROM ref_especialidad_por_puesto WHERE activo = true'
        ))
        MAPEO_ESPECIALIDAD_POR_PUESTO = {r[0]: r[1] for r in rows}
    _MAPEO_ESPECIALIDAD_POR_PUESTO_UPPER = {
        k.upper(): v for k, v in MAPEO_ESPECIALIDAD_POR_PUESTO.items()
    }


PUESTOS_SIN_ESPECIALIDAD_DERIVABLE = {
    'Suplente de Guardia': 1,
}


def _es_vacia(serie):
    return serie.isna() | (serie.astype(str).str.strip() == '')


# A pedido del usuario: los valores que este modulo escribe en ESPECIALIDAD a partir de
# MAPEO_ESPECIALIDAD_POR_PUESTO van sin tilde y en mayuscula. El diccionario de arriba se deja en
# Formato Titulo CON tildes nada mas por legibilidad de quien lo revisa/edita a mano; la
# conversion pasa aca, en el momento de escribir el valor. No se le quita la tilde a lo que
# resuelve el paso 1 (CUIL) porque eso es una copia textual de un dato real que ya estaba
# cargado, no un valor inventado por este modulo.
#
# Publica (sin "_" adelante) porque Dotaneitor.py tambien la importa: a pedido del usuario, el
# "sin tilde y en mayuscula" no es solo para lo que completa este modulo, sino para TODAS las
# columnas de vocabulario controlado que ya se forzaban a mayuscula (COLUMNAS_MAYUSCULA_FORZADA:
# LITERAL PUESTO, ESPECIALIDAD entera -no solo lo que completa este modulo-, AGRUPADOR, etc.) —
# ver _forzar_mayusculas en Dotaneitor.py. Las columnas de datos personales (AYN, DOMICILIO,
# LOCALIDAD, MAIL_*, etc.) NO pasan por aca y conservan sus tildes.
TABLA_SIN_TILDE = str.maketrans('áéíóúÁÉÍÓÚ', 'aeiouAEIOU')


def sin_tilde_mayuscula(texto):
    """Mayúscula completa + sin tilde (á/é/í/ó/ú, con o sin mayúscula). No toca 'ñ' (no es una
    tilde, es una letra propia del español) ni ningún otro carácter."""
    return texto.translate(TABLA_SIN_TILDE).upper()


def sin_tilde(texto):
    """Solo saca la tilde (á/é/í/ó/ú, con o sin mayúscula), sin tocar mayúscula/minúscula ni 'ñ'.
    A diferencia de sin_tilde_mayuscula(), para columnas que deben conservar su capitalización
    original (nombres de personas, domicilios, comentarios, etc.) — a pedido del usuario,
    2026-08-06: sin tilde en TODO el archivo generado, no solo en las columnas de vocabulario
    controlado que ya se forzaban a mayúscula."""
    return texto.translate(TABLA_SIN_TILDE)


# Version en mayuscula de MAPEO_ESPECIALIDAD_POR_PUESTO para matchear sin importar el casing de
# LITERAL PUESTO en el momento en que corra esto: Dotaneitor.py fuerza esa columna a MAYUSCULA
# COMPLETA como parte de procesar() (ver COLUMNAS_MAYUSCULA_FORZADA), pero este modulo tambien se
# puede correr standalone sobre un Excel que no haya pasado por ahi (ej. Dotacion_procesada.xlsx
# de una corrida vieja, en Formato Titulo). Las keys de arriba se mantienen en Formato Titulo
# nada mas por legibilidad para quien revise el diccionario a mano.
_MAPEO_ESPECIALIDAD_POR_PUESTO_UPPER = {
    clave.upper(): valor for clave, valor in MAPEO_ESPECIALIDAD_POR_PUESTO.items()
}


def completar_especialidad_por_agrupador(df):
    """
    Completa ESPECIALIDAD para las filas de `df` cuyo AGRUPADOR sea Medico/No medico/Residente*
    y tengan ESPECIALIDAD vacía, primero por coincidencia de CUIL y después por
    MAPEO_ESPECIALIDAD_POR_PUESTO. Nunca pisa un valor ya cargado. No modifica `df` in place.

    Parámetros
    ----------
    df : pd.DataFrame
        Debe tener las columnas AGRUPADOR, ESPECIALIDAD, CUIL y LITERAL PUESTO (el formato de
        Dotacion_procesada.xlsx / resultado_df de Dotaneitor).

    Devuelve
    --------
    (df_resultado, resumen, detalle_sin_resolver)
      - df_resultado: copia de `df` con ESPECIALIDAD completada donde se pudo.
      - resumen: dict con cantidades — 'total_alcance', 'cuil', 'puesto', 'sin_resolver'.
      - detalle_sin_resolver: pd.DataFrame con columnas CUIL Y ROL / AYN / VALOR (VALOR describe
        el puesto y el AGRUPADOR), una fila por cargo que quedó vacío a pesar de estar en el
        alcance — mismo formato que el resto de self.detalle_calidad en Dotaneitor.py, listo para
        sumarse tal cual al reporte de calidad.
    """
    df = df.copy()

    en_alcance = (
        df['AGRUPADOR'].astype(str).str.upper().str.contains('MEDICO', na=False)
        | df['AGRUPADOR'].astype(str).str.upper().str.contains('RESIDENTE', na=False)
    )
    vacia = _es_vacia(df['ESPECIALIDAD'])
    objetivo = en_alcance & vacia

    resumen = {'total_alcance': int(objetivo.sum()), 'cuil': 0, 'puesto': 0, 'sin_resolver': 0}

    columnas_id = [c for c in ('CUIL Y ROL', 'AYN') if c in df.columns]

    def _detalle_vacio():
        return pd.DataFrame(columns=columnas_id + ['VALOR'])

    if resumen['total_alcance'] == 0:
        return df, resumen, _detalle_vacio()

    # --- Paso 1: CUIL (misma persona con ESPECIALIDAD ya cargada en otro cargo) ---
    completas = df.loc[~vacia]
    cuil_a_especialidad = completas.groupby('CUIL')['ESPECIALIDAD'].agg(lambda s: s.value_counts().index[0])

    idx_objetivo = df.index[objetivo]
    por_cuil = df.loc[idx_objetivo, 'CUIL'].map(cuil_a_especialidad)
    resueltos_cuil = por_cuil.dropna()
    df.loc[resueltos_cuil.index, 'ESPECIALIDAD'] = resueltos_cuil
    resumen['cuil'] = len(resueltos_cuil)

    # --- Paso 2: diccionario por LITERAL PUESTO, sobre lo que quedó sin resolver por CUIL ---
    # Se matchea en mayuscula (ver _MAPEO_ESPECIALIDAD_POR_PUESTO_UPPER) para no depender del
    # casing con el que venga LITERAL PUESTO en `df`.
    pendiente = idx_objetivo.difference(resueltos_cuil.index)
    puesto_upper = df.loc[pendiente, 'LITERAL PUESTO'].astype(str).str.strip().str.upper()
    por_puesto = puesto_upper.map(_MAPEO_ESPECIALIDAD_POR_PUESTO_UPPER)
    resueltos_puesto = por_puesto.dropna().apply(sin_tilde_mayuscula)
    df.loc[resueltos_puesto.index, 'ESPECIALIDAD'] = resueltos_puesto
    resumen['puesto'] = len(resueltos_puesto)

    # --- Lo que sigue vacío, queda para revisión manual. VALOR sigue el mismo formato que el
    # resto de self.detalle_calidad en Dotaneitor.py (CUIL Y ROL / AYN / VALOR), con el puesto y
    # el agrupador como contexto de por qué no se pudo derivar. ---
    sin_resolver_idx = pendiente.difference(resueltos_puesto.index)
    resumen['sin_resolver'] = len(sin_resolver_idx)

    detalle_sin_resolver = df.loc[sin_resolver_idx, columnas_id].copy()
    detalle_sin_resolver['VALOR'] = (
        'Puesto: ' + df.loc[sin_resolver_idx, 'LITERAL PUESTO'].astype(str)
        + ' (AGRUPADOR: ' + df.loc[sin_resolver_idx, 'AGRUPADOR'].astype(str) + ')'
    )

    return df, resumen, detalle_sin_resolver


if __name__ == '__main__':
    # Prueba manual standalone: correr `python especialidad_por_agrupador.py` desde esta carpeta
    # para ver el resumen sin tener que abrir Dotaneitor. No escribe nada a disco.
    ruta = 'Dotacion_procesada.xlsx'
    print(f'Leyendo {ruta}...')
    df_original = pd.read_excel(ruta, sheet_name='Dotacion')

    df_resultado, resumen, detalle = completar_especialidad_por_agrupador(df_original)

    print()
    print('Resumen:')
    for k, v in resumen.items():
        print(f'  {k}: {v}')
    print()
    if len(detalle):
        print(f'Puestos sin resolver (top 10 por frecuencia):')
        print(detalle['VALOR'].value_counts().head(10).to_string())
