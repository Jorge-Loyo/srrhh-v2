"""
Cruce de ESPECIALIDAD por CUIL entre Cargos_Salud y la base de Especialidades (hojas
ESPECIALIDADES CPH / SUPLENTES / RESIDENTES de ARCHIVOS PARA DOTACION.xlsx).

Reglas acordadas con el usuario (cascada de completado de especialidad vacia):
- (1) Si el padron trae especialidad no vacia, esa manda (tras normalizar).
- (2) Si viene vacia, se completa con la ULTIMA especialidad conocida del MISMO rol/cargo
  (cuil_y_rol) en padrones anteriores -> buscar_especialidad_por_rol. NUNCA la de otro rol.
- (3) Si ese rol nunca tuvo especialidad, se consulta el comparativo POR CUIL
  (buscar_especialidad) SOLO si es NO AMBIGUO (una unica especialidad real para ese CUIL); si
  hay varias distintas -> vacio (_resolver_especialidad_unica devuelve None ante ambiguedad).
- (4) Si nada resuelve -> vacio.
  Principio rector: entre vacio y una especialidad que no corresponde, se prefiere vacio. El
  cruce POR CUIL ya NO colapsa a la mas frecuente (eso heredaba la especialidad de otro rol).
- Que Codigo de Registro (COD_REG) usa cada hoja:
    37 (Nueva Carrera Prof. Hosp) -> ESPECIALIDADES CPH
    23 (Salud - Guardias)         -> ESPECIALIDADES SUPLENTES
    24 (Residencias)              -> ESPECIALIDADES RESIDENTES
  Cualquier otro COD_REG no cruza con ninguna base (no tiene especialidad definida).
- Adentro de cada hoja hay algunas filas duplicadas por "Cuil y Rol" (mismo cargo cargado dos
  veces, a veces con variante de tipeo); se deduplica quedandose con la ultima.
"""
import pandas as pd

from normalizador_cargos import formato_titulo_tecnico, limpiar_texto_generico
from consolidacion_especialidades import normalizar_especialidad

HOJAS_POR_COD_REG = {
    '37': 'ESPECIALIDADES CPH',
    '23': 'ESPECIALIDADES SUPLENTES',
    '24': 'ESPECIALIDADES RESIDENTES',
}

# Coincide con formato_titulo_tecnico('SIN ESPECIALIDAD') == 'Sin Especialidad': el valor de la
# hoja se normaliza (Formato Titulo) antes de compararlo contra esta constante, asi que tiene que
# quedar escrita igual que el resultado de esa normalizacion, no en mayuscula.
SIN_ESPECIALIDAD = 'Sin Especialidad'


def normalizar_texto_especialidad(valor):
    """Limpieza completa de un valor de ESPECIALIDAD UNIF.: espacios/codificacion, consolidacion
    de errores de tipeo conocidos (consolidacion_especialidades) y Formato Titulo. Se usa
    tanto al leer las hojas en tiempo de ejecucion (ConsolidadorEspecialidades.cargar) como en la
    migracion que deja el Excel de referencia ya prolijo, para que ambos caminos den el mismo
    resultado."""
    if not isinstance(valor, str):
        return valor
    valor = limpiar_texto_generico(valor)
    valor = normalizar_especialidad(valor)
    return formato_titulo_tecnico(valor)


def _resolver_especialidad_unica(valores):
    """Devuelve la UNICA especialidad real del grupo, o None si hay AMBIGUEDAD (mas de una
    especialidad real distinta). Principio rector del usuario: entre vacio y una especialidad
    ajena, se prefiere vacio. 'SIN ESPECIALIDAD' se descarta primero; si tras descartarlo queda
    exactamente una real -> esa; si quedan >=2 reales distintas -> None (ya NO se elige la mas
    frecuente, para no heredar la especialidad de otro rol de la persona).

    USO: solo el lookup POR CUIL (paso 3 de la cascada). El lookup POR ROL NO usa esta funcion
    (ver ConsolidadorEspecialidadesBD.cargar / buscar_especialidad_por_rol)."""
    valores = [v for v in valores if pd.notna(v)]
    if not valores:
        return None
    reales = [v for v in valores if v != SIN_ESPECIALIDAD]
    # Si no hay ninguna real (todas 'SIN ESPECIALIDAD'), el conjunto es {SIN_ESPECIALIDAD} y se
    # devuelve ese placeholder, que buscar_especialidad ya trata como None (vacio).
    distintas = set(reales) if reales else set(valores)
    if len(distintas) == 1:
        return next(iter(distintas))
    return None   # ambiguo -> vacio (antes: la mas frecuente)


def _clave_rol(cuil_y_rol):
    """Canonicaliza 'Cuil y Rol' a '{cuil sin guiones}-{rol}'. El ultimo guion separa el rol;
    los guiones del tramo CUIL se quitan. Robusto aun si algun origen trajera el CUIL con guiones
    o espacios al frente. Ambos lados del join (ref_especialidades_cuil y el pipeline) producen el
    mismo formato; esto solo garantiza la limpieza (trim + guiones)."""
    s = str(cuil_y_rol).strip()
    if '-' not in s:
        return s
    cuil_part, _, rol_part = s.rpartition('-')
    return cuil_part.replace('-', '') + '-' + rol_part.strip()


class ConsolidadorEspecialidades:
    """Arma el lookup CUIL -> especialidad para cada una de las 3 categorias, y expone
    buscar_especialidad(cuil, cod_reg) para usar durante el armado de la Dotacion."""

    def __init__(self):
        self.lookups = {}  # cod_reg (str) -> dict CUIL -> especialidad (paso 3: por CUIL)
        # Paso 2 de la cascada: lookup POR ROL (cuil_y_rol normalizado -> ultima especialidad
        # conocida de ESE rol). Se inicializa aca para que las instancias creadas por __new__
        # en los tests tengan el atributo, igual que self.lookups.
        self.lookups_por_rol = {}  # cod_reg (str) -> dict CUIL_Y_ROL_NORM -> especialidad
        self.reporte = {}

    def cargar(self, ruta_archivo):
        self.lookups = {}
        self.reporte = {}
        for cod_reg, hoja in HOJAS_POR_COD_REG.items():
            try:
                df = pd.read_excel(ruta_archivo, sheet_name=hoja, dtype={'CUIL': str})
            except FileNotFoundError:
                raise RuntimeError(f"No se encontró el archivo de especialidades:\n{ruta_archivo}")
            except PermissionError:
                raise RuntimeError(
                    f"No se pudo leer la hoja '{hoja}' porque el archivo está abierto en otro "
                    f"programa (ej. Excel). Cerralo e intentá de nuevo:\n{ruta_archivo}"
                )
            except ValueError as e:
                raise RuntimeError(
                    f"No se encontró la hoja '{hoja}' en el archivo de especialidades "
                    f"({ruta_archivo}): {e}"
                )
            # Normalizar ESPECIALIDAD UNIF. (espacios/codificacion + errores de tipeo conocidos +
            # Formato Titulo) ANTES de deduplicar, asi variantes tipo
            # "PSIQUATRIA"/"PSIQUIATRIA" para la misma persona quedan como un solo valor y no
            # generan una ambiguedad falsa.
            df = df.copy()
            df['ESPECIALIDAD UNIF.'] = df['ESPECIALIDAD UNIF.'].apply(normalizar_texto_especialidad)

            filas_antes = len(df)
            df = df.drop_duplicates(subset='Cuil y Rol', keep='last')
            duplicados_sacados = filas_antes - len(df)

            lookup = df.groupby('CUIL')['ESPECIALIDAD UNIF.'].apply(_resolver_especialidad_unica).to_dict()
            self.lookups[cod_reg] = lookup

            cuiles_ambiguos = df.groupby('CUIL')['ESPECIALIDAD UNIF.'].nunique()
            self.reporte[hoja] = {
                'cuiles': len(lookup),
                'filas_duplicadas_removidas': duplicados_sacados,
                'cuiles_con_varias_especialidades': int((cuiles_ambiguos > 1).sum()),
            }

    def buscar_especialidad(self, cuil, cod_reg):
        """Paso 3 de la cascada (comparativo POR CUIL). Devuelve la especialidad para un CUIL
        segun su Codigo de Registro, o None si el Codigo de Registro no tiene base asociada, el
        CUIL no esta mapeado, o el CUIL es AMBIGUO (varias especialidades reales distintas). La
        regla de ambiguedad -> None la aporta automaticamente _resolver_especialidad_unica, que
        es con lo que se construyo el lookup; no hace falta logica extra aca."""
        if cuil is None or pd.isna(cuil):
            return None
        cod_reg = str(cod_reg).strip() if cod_reg is not None and pd.notna(cod_reg) else None
        lookup = self.lookups.get(cod_reg)
        if lookup is None:
            return None
        especialidad = lookup.get(str(cuil).strip())
        if especialidad is None or especialidad == SIN_ESPECIALIDAD:
            return None
        return especialidad

    def buscar_especialidad_por_rol(self, cuil_y_rol, cod_reg):
        """Paso 2 de la cascada (historico del MISMO rol). Devuelve la ULTIMA especialidad
        conocida de ese cuil_y_rol en su Codigo de Registro, o None si no esta, si el cod_reg no
        tiene base, o si el valor es SIN_ESPECIALIDAD. NO usa _resolver_especialidad_unica: dentro
        de un mismo rol no debe anularse por ambiguedad (eso borraria la especialidad del rol);
        se usa la ultima conocida, que es exactamente lo que pidio el usuario."""
        if cuil_y_rol is None or (isinstance(cuil_y_rol, float) and pd.isna(cuil_y_rol)):
            return None
        cod_reg = str(cod_reg).strip() if cod_reg is not None and pd.notna(cod_reg) else None
        lookup = self.lookups_por_rol.get(cod_reg)
        if lookup is None:
            return None
        especialidad = lookup.get(_clave_rol(cuil_y_rol))
        if especialidad is None or especialidad == SIN_ESPECIALIDAD:
            return None
        return especialidad

    def generar_lineas_reporte(self):
        lineas = []
        for hoja, datos in self.reporte.items():
            lineas.append(
                f"{hoja}: {datos['cuiles']} CUILes cargados "
                f"({datos['filas_duplicadas_removidas']} filas duplicadas removidas, "
                f"{datos['cuiles_con_varias_especialidades']} CUILes con mas de una especialidad "
                f"distinta entre sus cargos, quedan sin resolver por CUIL = ambiguos -> vacio)"
            )
        return lineas


def limpiar_cuil(cuil):
    """Saca los guiones del CUIL (Cargos_Salud usa '20-04404725-0'; las bases de Especialidad
    usan '20041403218', sin guiones)."""
    if cuil is None or pd.isna(cuil):
        return None
    return str(cuil).replace('-', '').strip()


def completar_especialidad(df, ruta_archivo_especialidades, columna_especialidad='ESPECIALIDAD',
                            columna_cuil='CUIL', columna_cod_reg='COD_REG'):
    """Completa los HUECOS de la columna de especialidad (viene de LIT_ESP_CARGO en Cargos_Salud)
    cruzando por CUIL + Codigo de Registro contra las bases de Especialidad. El valor que ya
    trae Cargos_Salud es la autoridad: si la fila ya tiene especialidad cargada, NO se toca ni
    se cuestiona, se cruza unicamente para llenar las filas que vienen vacias.

    Devuelve (df_completado, consolidador, cantidad_completada)."""
    consolidador = ConsolidadorEspecialidades()
    consolidador.cargar(ruta_archivo_especialidades)

    df = df.copy()
    valores = list(df[columna_especialidad])
    completados = 0
    for i, (valor_actual, cuil, cod_reg) in enumerate(
        zip(df[columna_especialidad], df[columna_cuil], df[columna_cod_reg])
    ):
        if pd.notna(valor_actual) and str(valor_actual).strip():
            continue  # ya tiene dato: se respeta tal cual, no se toca

        especialidad = consolidador.buscar_especialidad(limpiar_cuil(cuil), cod_reg)
        if especialidad is not None:
            valores[i] = especialidad
            completados += 1

    df[columna_especialidad] = valores
    return df, consolidador, completados


def resumen_cobertura(df, columna_especialidad='ESPECIALIDAD', columna_cod_reg='COD_REG'):
    """Resumen de cobertura de especialidad, solo entre las filas cuyo Codigo de Registro
    corresponde a alguna de las 3 categorias con especialidad (37 CPH, 23 Suplentes, 24
    Residentes). El resto de los Codigos de Registro nunca tienen especialidad y no cuentan."""
    lineas = []
    cod_reg_str = df[columna_cod_reg].astype(str).str.strip()
    for cod_reg, nombre in [('37', 'CPH'), ('23', 'Suplentes'), ('24', 'Residentes')]:
        sub = df[cod_reg_str == cod_reg]
        con_dato = sub[columna_especialidad].notna().sum()
        total = len(sub)
        pct = (100 * con_dato / total) if total else 0
        lineas.append(f"{nombre} (COD_REG {cod_reg}): {con_dato} de {total} con especialidad ({pct:.1f}%)")
    return lineas


def limpiar_especialidad_indebida(df, columna_especialidad='ESPECIALIDAD', columna_cod_reg='COD_REG',
                                   columna_identificador='CUIL Y ROL', columna_nombre='AYN'):
    """Vacia ESPECIALIDAD en filas cuyo Codigo de Registro no corresponde a ninguna de las 3
    categorias que tienen especialidad definida (37 CPH, 23 Suplentes, 24 Residentes). Si aparece
    algo cargado ahi es un dato inconsistente de origen (viene de LIT_ESP_CARGO en Cargos_Salud),
    no una especialidad real, y no debe quedar en el resultado.

    Devuelve (df_limpio, cantidad_limpiada, codigos_de_registro_afectados, detalle), donde detalle
    es un DataFrame con una fila por registro afectado (columna_identificador, columna_nombre si
    existe, y VALOR con lo que tenia cargado antes de vaciarse)."""
    df = df.copy()
    cod_reg_str = df[columna_cod_reg].astype(str).str.strip()
    tiene_especialidad = df[columna_especialidad].notna() & (df[columna_especialidad].astype(str).str.strip() != '')
    mask = tiene_especialidad & ~cod_reg_str.isin(HOJAS_POR_COD_REG.keys())

    cantidad = int(mask.sum())
    codigos_afectados = sorted(cod_reg_str[mask].unique()) if cantidad else []

    columnas = [c for c in (columna_identificador, columna_nombre) if c in df.columns]
    detalle = df.loc[mask, columnas].copy()
    detalle['VALOR'] = (
        df.loc[mask, columna_especialidad].astype(str) + ' (Código de Registro ' + cod_reg_str[mask] + ')'
    )

    df.loc[mask, columna_especialidad] = None
    return df, cantidad, codigos_afectados, detalle


def filas_especialidad_sin_puesto(df, columna_especialidad='ESPECIALIDAD', columna_puesto='LITERAL PUESTO',
                                   columna_identificador='CUIL Y ROL', columna_nombre='AYN'):
    """Devuelve un DataFrame con las filas que tienen ESPECIALIDAD cargada pero no tienen puesto
    (columna_puesto vacia). Es un dato inconsistente que no se puede corregir solo con lo que hay
    disponible: se informa para revision manual, no se toca. Columnas del resultado:
    columna_identificador, columna_nombre (si existe) y columna_especialidad."""
    sin_puesto = df[columna_puesto].isna() | (df[columna_puesto].astype(str).str.strip() == '')
    con_especialidad = df[columna_especialidad].notna() & (df[columna_especialidad].astype(str).str.strip() != '')
    mask = sin_puesto & con_especialidad

    columnas = [c for c in (columna_identificador, columna_nombre) if c in df.columns]
    detalle = df.loc[mask, columnas].copy()
    detalle[columna_especialidad] = df.loc[mask, columna_especialidad]
    return detalle
