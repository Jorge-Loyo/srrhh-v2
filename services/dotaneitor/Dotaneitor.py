# Nota (hallazgo #2/#9 de Doc/Dotaneitor_Analisis.md, aplicado en S2-1): este
# archivo tenía además una clase DotacionGUI (Tkinter) de ~600 líneas sin
# ningún uso en el microservicio — main.py mockeaba tkinter entero solo para
# poder importar DotacionAutomation sin arrastrarla. Se sacó de acá (la app de
# escritorio standalone con GUI vive en su repo original, dotacion-rrhh); esto
# es ahora solo el módulo de lógica de negocio, y ya no depende de tkinter.
import pandas as pd
import numpy as np
import traceback

from especialidades import limpiar_especialidad_indebida, filas_especialidad_sin_puesto
from especialidad_por_agrupador import sin_tilde_mayuscula, sin_tilde

# Columnas "nucleo" para la hoja 'Completitud por fila' del reporte de calidad: definidas a mano
# con el usuario, porque el resto de las columnas (COMISION, BLOQ MOTIVO, ESCRITORIO, etc.) son
# opcionales por diseño y solo aplican a una parte del personal, asi que marcarlas vacias no es un
# problema real. Estas si deberian tener dato siempre (o casi siempre) y vale la pena revisar caso
# por caso cuando no lo tienen.
COLUMNAS_NUCLEO_COMPLETITUD = [
    'ID SIAL', 'CUIL', 'CUIL Y ROL', 'NUMERO DOC', 'CODIGO REPA', 'DESCRIPCION REPA', 'SIGLAS',
    'UNIVERSO TOTALIZADOR', 'TIPO DE HOSPITAL / SIGLA', 'ESCALAFON', 'CODIGO DE REGISTRO',
    'LITERAL CR', 'SITUACION DE REVISTA', 'PUESTO', 'LITERAL PUESTO', 'ESPECIALIDAD',
    'UNIFICADOR DE PUESTOS', 'AGRUPADOR', 'ESTADO',
]

# Columnas cuyo contenido va siempre en MAYUSCULA COMPLETA (no Formato Titulo), a pedido explicito
# del usuario: para estas no aplica el criterio de "correcto uso de mayusculas/minusculas" que se
# usa en el resto del vocabulario controlado. Se fuerza sin importar si el valor viene de
# Cargos_Salud ya normalizado, de un cruce contra ARCHIVOS PARA DOTACION.xlsx, o de un calculo
# interno (JEFE ESCALAFON).
COLUMNAS_MAYUSCULA_FORZADA = [
    'ESPECIALIDAD', 'AGRUPADOR', 'UNIVERSO TOTALIZADOR',
    'TIPO DE HOSPITAL / SIGLA', 'MONOVALENCIA', 'UNIFICADOR DE PUESTOS',
    'JEFE ESCALAFON',
]


# Columnas que deben conservar tildes y capitalización original (Formato Título):
# no entran ni en COLUMNAS_MAYUSCULA_FORZADA ni en el paso genérico de sin_tilde.
COLUMNAS_CON_TILDE = {
    'LITERAL PUESTO', 'SITUACION DE REVISTA', 'ESTADO',
    'AYN', 'DOMICILIO', 'LOCALIDAD', 'PROVINCIA',
}


class DotacionAutomation:
    """Clase para automatizar la creación del archivo de dotación"""
    
    def __init__(self):
        self.cargos_df = None
        self.agrupador_df = None
        self.unificador_df = None
        self.siglas_df = None
        self.resultado_df = None
        self.reporte_calidad = {}
        self.detalle_calidad = {}
        
    def cargar_archivos(self, ruta_cargos, ruta_archivos_dotacion):
        """Carga los archivos Excel necesarios"""
        try:
            # Cargar Cargos_salud.xlsx
            # Especificar dtype para NUM_DOC para mantener ceros al inicio
            dtype_dict = {'NUM_DOC': str}
            self.cargos_df = pd.read_excel(ruta_cargos, sheet_name='Sheet1', dtype=dtype_dict)
        except FileNotFoundError:
            return False, f"No se encontró el archivo Cargos_Salud:\n{ruta_cargos}"
        except PermissionError:
            return False, (
                f"No se pudo leer Cargos_Salud porque está abierto en otro programa (ej. Excel).\n"
                f"Cerralo e intentá de nuevo:\n{ruta_cargos}"
            )
        except ValueError as e:
            return False, f"Cargos_Salud no tiene la hoja 'Sheet1' esperada ({e})"
        except Exception as e:
            return False, f"Error al leer Cargos_Salud: {str(e)}"

        try:
            # Cargar tablas de referencia desde ARCHIVOS PARA DOTACION.xlsx
            self.agrupador_df = pd.read_excel(ruta_archivos_dotacion, sheet_name='AGRUPADOR')
            self.unificador_df = pd.read_excel(ruta_archivos_dotacion, sheet_name='UNIFICADOR DE PUESTOS')
            self.siglas_df = pd.read_excel(ruta_archivos_dotacion, sheet_name='SIGLAS')
        except FileNotFoundError:
            return False, f"No se encontró el archivo ARCHIVOS PARA DOTACION:\n{ruta_archivos_dotacion}"
        except PermissionError:
            return False, (
                f"No se pudo leer ARCHIVOS PARA DOTACION porque está abierto en otro programa (ej. Excel).\n"
                f"Cerralo e intentá de nuevo:\n{ruta_archivos_dotacion}"
            )
        except ValueError as e:
            return False, (
                f"ARCHIVOS PARA DOTACION no tiene alguna de las hojas esperadas "
                f"(AGRUPADOR / UNIFICADOR DE PUESTOS / SIGLAS): {e}"
            )
        except Exception as e:
            return False, f"Error al leer ARCHIVOS PARA DOTACION: {str(e)}"

        return True, "Archivos cargados correctamente"
    
    def extraer_rol_de_cargo(self, cargo):
        """Extrae el número de rol del campo CARGO (después del guión)"""
        if pd.isna(cargo):
            return None
        cargo_str = str(cargo)
        if '-' in cargo_str:
            # Tomar el número después del guión
            partes = cargo_str.split('-')
            return partes[-1].strip()
        return None
    
    def limpiar_cuil(self, cuil):
        """Remueve guiones del CUIL y lo devuelve como número"""
        if pd.isna(cuil):
            return None
        # Remover todos los guiones
        return int(str(cuil).replace('-', ''))
    
    def procesar(self):
        """Ejecuta todas las transformaciones"""
        try:
            df = self.cargos_df.copy()
            
            # 0. Limpiar y ajustar datos previos
            # Limpiar SIGLA: UAIEAIT -> EAIT, quitar DGA solo de siglas que empiezan con DGAH
            df['SIGLA'] = df['SIGLA'].str.replace('UAIEAIT', 'EAIT', regex=False)
            df['SIGLA'] = df['SIGLA'].apply(lambda x: x[3:] if pd.notna(x) and isinstance(x, str) and x.startswith('DGAH') else x)
            
            # Cambiar LIT_COD_REG a "Nueva Carrera Prof. Hosp" donde COD_REG = 22
            df.loc[df['COD_REG'].astype(str).str.replace('B', '').str.strip() == '22', 'LIT_COD_REG'] = 'Nueva Carrera Prof. Hosp'
            
            # 1. Extraer ROL del CARGO
            df['ROL'] = df['CARGO'].apply(self.extraer_rol_de_cargo)
            
            # 2. Limpiar CUIL (remover guiones) y reemplazar la columna original
            df['CUIL'] = df['CUIL'].apply(self.limpiar_cuil)
            
            # 3. Crear columna CUIL Y ROL con guión entre ellos
            df['CUIL Y ROL'] = df['CUIL'].astype(str) + '-' + df['ROL'].astype(str)
            
            # 4. Eliminar columna ROL temporal
            df = df.drop(columns=['ROL'])
            
            # 5. Buscar valores en tabla SIGLAS
            # Renombrar columnas de SIGLAS para el merge si es necesario
            siglas_map = {}
            for idx, row in self.siglas_df.iterrows():
                sigla = row['Sigla']
                siglas_map[sigla] = {
                    'UNIVERSO TOTALIZADOR': row.get('UNIVERSO TOTALIZADOR'),
                    'Tipo de Hospital / Sigla': row.get('Tipo de Hospital / Sigla'),
                    'Monovalencia': row.get('Monovalencia')
                }
            
            df['UNIVERSO TOTALIZADOR'] = df['SIGLA'].map(lambda x: siglas_map.get(x, {}).get('UNIVERSO TOTALIZADOR'))
            df['Tipo de Hospital / Sigla'] = df['SIGLA'].map(lambda x: siglas_map.get(x, {}).get('Tipo de Hospital / Sigla'))
            df['Monovalencia'] = df['SIGLA'].map(lambda x: siglas_map.get(x, {}).get('Monovalencia'))

            mask_sin_sigla = df['SIGLA'].notna() & ~df['SIGLA'].isin(siglas_map.keys())
            siglas_no_encontradas = sorted(str(s) for s in df.loc[mask_sin_sigla, 'SIGLA'].unique())
            detalle_sin_sigla = df.loc[mask_sin_sigla, ['CUIL Y ROL', 'AYN', 'SIGLA']].rename(
                columns={'SIGLA': 'VALOR'}
            )
            
            # 6. Crear UNIFICADOR DE PUESTOS
            # Limpiar LIT_COD_REG removiendo caracteres especiales (como |)
            df['LIT_COD_REG_LIMPIO'] = df['LIT_COD_REG'].astype(str).str.replace('|', '').str.strip()
            df['CRUCE_UNIFICADOR'] = df['LIT_COD_REG_LIMPIO'] + ' - ' + df['LIT_PUESTO'].astype(str)
            
            # Crear diccionario de búsqueda para UNIFICADOR (normalizado: sin tilde, mayúscula)
            unificador_map = {}
            unificador_map_norm = {}
            for idx, row in self.unificador_df.iterrows():
                cruce = str(row['Cruce'])
                valor = row.get('UNIFICADOR DE PUESTO')
                unificador_map[cruce] = valor
                unificador_map_norm[sin_tilde_mayuscula(cruce)] = valor
            
            cruce_norm = df['CRUCE_UNIFICADOR'].apply(
                lambda v: sin_tilde_mayuscula(str(v)) if isinstance(v, str) else v
            )
            df['UNIFICADOR DE PUESTOS'] = cruce_norm.map(unificador_map_norm)

            mask_sin_unificador = ~cruce_norm.isin(unificador_map_norm.keys())
            unificador_no_encontrado = sorted(str(c) for c in df.loc[mask_sin_unificador, 'CRUCE_UNIFICADOR'].unique())
            detalle_sin_unificador = df.loc[mask_sin_unificador, ['CUIL Y ROL', 'AYN', 'CRUCE_UNIFICADOR']].rename(
                columns={'CRUCE_UNIFICADOR': 'VALOR'}
            )

            df = df.drop(columns=['CRUCE_UNIFICADOR', 'LIT_COD_REG_LIMPIO'])
            
            # 7. Crear AGRUPADOR
            df['CRUCE_AGRUPADOR'] = df['ESCALAFON'].astype(str) + ' - ' + df['LIT_PUESTO'].astype(str)
            
            # Crear diccionario de búsqueda para AGRUPADOR (normalizado: sin tilde, mayúscula)
            agrupador_map = {}
            agrupador_map_norm = {}
            for idx, row in self.agrupador_df.iterrows():
                cruce = str(row['CRUCE'])
                valor = row.get('AGRUPADOR')
                agrupador_map[cruce] = valor
                agrupador_map_norm[sin_tilde_mayuscula(cruce)] = valor
            
            cruce_agrup_norm = df['CRUCE_AGRUPADOR'].apply(
                lambda v: sin_tilde_mayuscula(str(v)) if isinstance(v, str) else v
            )
            # .astype('object') defensivo: si para este archivo ningún CRUCE_AGRUPADOR
            # matchea agrupador_map (o todos los matches son NaN), pandas infiere la
            # columna entera como float64 (todo NaN). El assignment de más abajo
            # (COD_SIT=32 -> "Enfermero/a ATP") escribe un string en esa columna, y
            # pandas moderno ya no permite el upcast implícito float64->object: tira
            # TypeError y tumba todo el pipeline. Forzar dtype object acá no cambia
            # ningún valor, solo garantiza que la columna pueda contener strings.
            df['AGRUPADOR'] = cruce_agrup_norm.map(agrupador_map_norm).astype('object')

            mask_sin_agrupador = ~cruce_agrup_norm.isin(agrupador_map_norm.keys())
            agrupador_no_encontrado = sorted(str(c) for c in df.loc[mask_sin_agrupador, 'CRUCE_AGRUPADOR'].unique())
            detalle_sin_agrupador = df.loc[mask_sin_agrupador, ['CUIL Y ROL', 'AYN', 'CRUCE_AGRUPADOR']].rename(
                columns={'CRUCE_AGRUPADOR': 'VALOR'}
            )

            df = df.drop(columns=['CRUCE_AGRUPADOR'])
            
            # 7.5. Ajustar AGRUPADOR: si COD_SIT=32 y AGRUPADOR="Enfermero/a", cambiar a "Enfermero/a ATP"
            df.loc[(df['AGRUPADOR'] == 'Enfermero/a') & (df['COD_SIT'].astype(str) == '32'), 'AGRUPADOR'] = 'Enfermero/a ATP'
            
            # 7.6 Limpiar JCAT: "0" no es un código de jefatura real (equivale a no tener jefatura),
            # se deja vacío igual que un NaN para que ni CODIGO JEFATURAS ni JEFE ESCALAFON lo
            # muestren como si fuera una jefatura genuina
            df['JCAT'] = df['JCAT'].apply(lambda x: None if pd.isna(x) or str(x).strip() == '0' else x)

            # 8. Crear columna "Jefe ESCALAFON"
            df['JEFATURA ESCALAFON'] = self._calcular_jefe_escalafon(df)
            
            # 9. Crear columna "estado"
            df['ESTADO'] = self._calcular_estado(df)
            
            # 9.5 Renombrar columnas según especificación final
            rename_dict = {
                'CARGO': 'ID SIAL',
                'FEC_NACIM': 'FECHA NACIMIENTO',
                'TIP_DOC': 'TIPO DOC',
                'NUM_DOC': 'NUMERO DOC',
                'COD_REP': 'CODIGO REPA',
                'DESC_REP': 'DESCRIPCION REPA',
                'SIGLA': 'SIGLAS',
                'Tipo de Hospital / Sigla': 'TIPO DE HOSPITAL / SIGLA',
                'Monovalencia': 'MONOVALENCIA',
                'COD_REG': 'CODIGO DE REGISTRO',
                'LIT_COD_REG': 'LITERAL CR',
                'SIT_REV': 'SITUACION DE REVISTA',
                'LIT_PUESTO': 'LITERAL PUESTO',
                'LIT_ESP_CARGO': 'ESPECIALIDAD',
                'JCAT': 'CODIGO JEFATURAS',
                'JEFATURA ESCALAFON': 'JEFE ESCALAFON',
                'DOC_RESPALD': 'DOCUMENTACION JEFATURA',
                'J_COMENTARIO': 'COMENTARIOS JEFATURAS',
                'DOC_RESP': 'DOCUEMNTACION POU',
                'SR_WU_COMISION': 'COMISION',
                'SR_DESC_WU_COMISION': 'REPA COMISION',
                'LIT_AGRUPAMIENTO': 'AGRUPAMIENTO',
                'COD_SIT': 'COD SITUACION',
                'BLOQ_DESDE': 'FECHA BLOQUEO',
                'BLOQ_COMENTARIO': 'BLOQUEO COMENTARIO',
                'BL_MOTIVO': 'BLOQ MOTIVO',
                'DOC_RESP_ALTA': 'DOCUMENTACION DEL ROL',
                'DOC_RESP_BAJA': 'DOCUMENTACION BAJA',
                'SALUD_1ER_CARGO': 'ANTIGÜEDAD'
            }
            df = df.rename(columns=rename_dict)

            # 9.6 Limpiar ESPECIALIDAD en Codigos de Registro que no deberian tenerla (solo 37 CPH,
            # 23 Suplentes y 24 Residentes tienen especialidad definida; si aparece algo cargado en
            # cualquier otro codigo es un dato inconsistente de origen, no una especialidad real)
            df, especialidad_limpiada, cod_reg_limpiados, detalle_especialidad_limpiada = limpiar_especialidad_indebida(
                df, columna_especialidad='ESPECIALIDAD', columna_cod_reg='CODIGO DE REGISTRO'
            )

            # 9.7 Detectar ESPECIALIDAD cargada sin LITERAL PUESTO (dato inconsistente que no se
            # puede corregir solo: se informa para revision manual, no se toca)
            detalle_especialidad_sin_puesto = filas_especialidad_sin_puesto(df).rename(columns={'ESPECIALIDAD': 'VALOR'})
            especialidad_sin_puesto = detalle_especialidad_sin_puesto['CUIL Y ROL'].tolist()

            # 9.75 Forzar mayúscula completa en las columnas pedidas por el usuario (ver
            # COLUMNAS_MAYUSCULA_FORZADA), antes de detectar duplicados de ID SIAL para que una
            # diferencia de solo mayúscula/minúscula entre filas no cuente como una diferencia real.
            df = self._forzar_mayusculas(df)

            # 9.8 Eliminar duplicados de ID SIAL: el padrón de origen puede traer varias filas para
            # el mismo cargo (ej. una por cada DIA de guardia que cubre), lo cual es legítimo, pero
            # también aparecen filas redundantes. Ante un mismo ID SIAL repetido se conserva una
            # sola fila (la más completa según las columnas núcleo; en empate, la primera) y se
            # descartan las demás, dejando constancia en el reporte de calidad de qué se descartó.
            df, duplicados_grupos, duplicados_filas_eliminadas, detalle_duplicados_id_sial = (
                self._eliminar_duplicados_id_sial(df)
            )

            # 9.9 Detectar y eliminar jefaturas CPH con rol duplicado activo: una persona con dos
            # roles ACTIVOS del mismo LITERAL PUESTO en el mismo efector. El rol válido es el que
            # tiene CODIGO JEFATURAS con valor; el que tiene CODIGO JEFATURAS vacío es el error de
            # origen — se elimina del resultado y se documenta en el reporte de calidad.
            detalle_jefaturas_duplicadas = self._detectar_jefaturas_duplicadas(df)
            jefaturas_duplicadas_count = len(detalle_jefaturas_duplicadas)
            if jefaturas_duplicadas_count:
                ids_error = set(detalle_jefaturas_duplicadas['ID SIAL'].dropna().astype(str))
                df = df[~df['ID SIAL'].astype(str).isin(ids_error)].reset_index(drop=True)

            # 10. Reordenar columnas según especificación
            df = self._reordenar_columnas(df)

            self.reporte_calidad = {
                'sin_sigla': siglas_no_encontradas,
                'sin_unificador': unificador_no_encontrado,
                'sin_agrupador': agrupador_no_encontrado,
                'especialidad_limpiada': especialidad_limpiada,
                'especialidad_limpiada_cod_reg': cod_reg_limpiados,
                'especialidad_sin_puesto': especialidad_sin_puesto,
                'duplicados_id_sial_grupos': duplicados_grupos,
                'duplicados_id_sial_filas_eliminadas': duplicados_filas_eliminadas,
                'jefaturas_duplicadas': jefaturas_duplicadas_count,
            }
            self.detalle_calidad = {
                'SIGLA sin coincidencia en hoja SIGLAS': detalle_sin_sigla,
                'UNIFICADOR DE PUESTOS sin coincidencia': detalle_sin_unificador,
                'AGRUPADOR sin coincidencia': detalle_sin_agrupador,
                'ESPECIALIDAD vaciada (Código de Registro sin especialidad)': detalle_especialidad_limpiada,
                'ESPECIALIDAD sin LITERAL PUESTO (revisar manualmente)': detalle_especialidad_sin_puesto,
                'ID SIAL duplicado (se eliminó, se conservó la fila más completa)': detalle_duplicados_id_sial,
                'JEFATURA CPH con rol duplicado activo (eliminado del resultado — corregir en SIAL)': detalle_jefaturas_duplicadas,
            }

            self.resultado_df = df
            return True, f"Procesamiento exitoso. {len(df)} registros procesados."

        except Exception as e:
            return False, f"Error en procesamiento: {str(e)}\n{traceback.format_exc()}"

    def generar_lineas_reporte_calidad(self):
        """Genera lineas de texto resumiendo valores que no encontraron coincidencia en los cruces"""
        lineas = []
        rep = self.reporte_calidad

        def resumen(nombre, valores, hoja_referencia):
            if not valores:
                return
            muestra = ', '.join(valores[:5])
            extra = f' (y {len(valores) - 5} mas)' if len(valores) > 5 else ''
            lineas.append(f"[!] {nombre}: {len(valores)} valor(es) sin coincidencia en {hoja_referencia}: {muestra}{extra}")

        resumen('SIGLA', rep.get('sin_sigla', []), 'hoja SIGLAS')
        resumen('UNIFICADOR DE PUESTOS', rep.get('sin_unificador', []), 'hoja UNIFICADOR DE PUESTOS')
        resumen('AGRUPADOR', rep.get('sin_agrupador', []), 'hoja AGRUPADOR')

        especialidad_limpiada = rep.get('especialidad_limpiada', 0)
        if especialidad_limpiada:
            codigos = ', '.join(rep.get('especialidad_limpiada_cod_reg', []))
            lineas.append(
                f"[!] ESPECIALIDAD: se vació en {especialidad_limpiada} fila(s) por tener un "
                f"Código de Registro sin especialidad definida (códigos encontrados: {codigos})"
            )

        especialidad_sin_puesto = rep.get('especialidad_sin_puesto', [])
        if especialidad_sin_puesto:
            muestra = ', '.join(especialidad_sin_puesto[:5])
            extra = f' (y {len(especialidad_sin_puesto) - 5} mas)' if len(especialidad_sin_puesto) > 5 else ''
            lineas.append(
                f"[!] ESPECIALIDAD sin LITERAL PUESTO: {len(especialidad_sin_puesto)} fila(s) tienen "
                f"especialidad cargada pero no tienen puesto, revisar (CUIL Y ROL): {muestra}{extra}"
            )

        duplicados_filas = rep.get('duplicados_id_sial_filas_eliminadas', 0)
        if duplicados_filas:
            grupos = rep.get('duplicados_id_sial_grupos', 0)
            lineas.append(
                f"[!] ID SIAL duplicado: {grupos} cargo(s) tenían filas repetidas, se eliminaron "
                f"{duplicados_filas} fila(s) duplicada(s) (se conservó la más completa de cada grupo; "
                f"ver reporte de calidad para el detalle)"
            )

        jefaturas_dup = rep.get('jefaturas_duplicadas', 0)
        if jefaturas_dup:
            lineas.append(
                f"[!] JEFATURA CPH con rol duplicado: {jefaturas_dup} fila(s) eliminadas del resultado "
                f"(rol sin CODIGO JEFATURAS en personas con dos roles activos del mismo tipo en el mismo "
                f"efector — pedir corrección en SIAL; ver reporte de calidad para el detalle)"
            )

        if not lineas:
            lineas.append("Sin problemas de cruce detectados: todas las claves fueron encontradas.")

        return lineas
    
    def _calcular_jefe_escalafon(self, df):
        """Calcula la columna Jefe ESCALAFON según reglas de negocio (vectorizado —
        ver hallazgo #7 de Doc/Dotaneitor_Analisis.md: antes recorría las 48k filas
        una por una con .iterrows(), igual que el resto de procesar() ya evita a
        propósito desde los pasos 5-7 (cruces por diccionario + .map())."""
        j_cat_vacio = df['JCAT'].isna() | (df['JCAT'].astype(str) == '')

        # COD_REG a numero limpio (puede venir '37', 37, '17B', etc.) — NaN si no parsea
        cod_reg_num = pd.to_numeric(
            df['COD_REG'].astype(str).str.replace('B', '', regex=False).str.strip(),
            errors='coerce',
        )

        has_escritorio = df['ESCRITORIO'].notna() & (df['ESCRITORIO'].astype(str) != '')

        condiciones = [
            j_cat_vacio,  # sin JCAT -> no es jefe, tiene prioridad sobre lo demas
            (cod_reg_num == 37) & ~has_escritorio,
            (cod_reg_num == 37) & has_escritorio,
            cod_reg_num == 85,
            cod_reg_num == 87,
            cod_reg_num == 83,
        ]
        valores = [None, 'Jefe CPH POF', 'Jefe CPH POU', 'Jefe Tecnico', 'Jefe Enfermeria', 'Jefe Administrativo']

        return np.select(condiciones, valores, default=None)

    def _calcular_estado(self, df):
        """Calcula la columna estado según reglas de negocio (vectorizado — ver
        hallazgo #7 de Doc/Dotaneitor_Analisis.md).

        De paso corrige un bug real encontrado al vectorizar: la version anterior
        sacaba la tilde 'á' antes de buscar 'retencion' en SIT_REV, pero la palabra
        es "retención" (con 'ó', no 'á') — el reemplazo no hacia nada y el ESTADO
        'Retencion de Cargo' nunca matcheaba contra datos reales con tilde, caia
        siempre en 'Activo' en silencio. Se usa sin_tilde() (ya importado, cubre
        todas las vocales) para ambos chequeos en vez de un .replace() de una sola
        letra elegida a mano."""
        bloqueado = df['BLOQ_DESDE'].notna() & (df['BLOQ_DESDE'].astype(str) != '')

        sit_rev_valido = df['SIT_REV'].notna()
        # fillna ANTES de astype(str): sin_tilde() no tiene guard para no-strings
        # (mismo contrato que el resto del código: el caller filtra antes de
        # llamarla), y astype(str) por si solo puede dejar NaN como float en
        # vez de convertirlo a texto segun la version de pandas.
        sit_rev_norm = df['SIT_REV'].fillna('').astype(str).str.lower().map(sin_tilde)

        retencion = sit_rev_valido & sit_rev_norm.str.contains('retencion', na=False)
        comision = sit_rev_valido & sit_rev_norm.str.contains('comision', na=False)

        condiciones = [bloqueado, retencion, comision]
        valores = ['Bloqueado', 'Retención de Cargo', 'Comisión']

        return np.select(condiciones, valores, default='Activo')
    
    def _forzar_mayusculas(self, df):
        """Fuerza a MAYUSCULA COMPLETA y SIN TILDE el contenido de COLUMNAS_MAYUSCULA_FORZADA (ver
        el porque en el comentario de esa constante), y SIN TILDE (conservando mayuscula/minuscula
        tal cual esten) en el resto de las columnas de texto — a pedido explicito del usuario,
        2026-08-06: sin tilde en todo el archivo generado, incluidos nombres de personas
        (AYN), domicilios, localidades, comentarios, etc. Idempotente: se puede llamar de nuevo
        despues de "Cruzar" para que los huecos que se completen ahi tambien queden sin tilde,
        igual que el resto de cada columna."""
        df = df.copy()
        for col in df.columns:
            if df[col].dtype != object:
                continue
            if col in COLUMNAS_MAYUSCULA_FORZADA:
                df[col] = df[col].apply(lambda v: sin_tilde_mayuscula(v) if isinstance(v, str) else v)
            elif col not in COLUMNAS_CON_TILDE:
                df[col] = df[col].apply(lambda v: sin_tilde(v) if isinstance(v, str) else v)
        return df

    def _eliminar_duplicados_id_sial(self, df, columna_id='ID SIAL'):
        """Colapsa filas con el mismo ID SIAL a una sola fila.

        El padrón de origen puede traer varias filas legítimas para el mismo ID SIAL (ej. una por
        cada DIA de guardia que la persona cubre), así que no alcanza con quedarse con la primera
        o la última: se conserva la fila con menos columnas núcleo vacías (mismo criterio que
        `calcular_completitud`), y ante empate la que aparece primero en el archivo original.

        Devuelve (df_sin_duplicados, cantidad_grupos_afectados, cantidad_filas_eliminadas,
        detalle_df) donde detalle_df tiene una fila por registro descartado (CUIL Y ROL, AYN,
        VALOR con el ID SIAL y en qué columnas difería de la fila que se conservó).
        """
        def _vacio(valor):
            if pd.isna(valor):
                return True
            return isinstance(valor, str) and valor.strip() == ''

        detalle_vacio = pd.DataFrame(columns=['CUIL Y ROL', 'AYN', 'VALOR'])

        if columna_id not in df.columns:
            return df, 0, 0, detalle_vacio

        mask_dup = df[columna_id].notna() & df.duplicated(subset=[columna_id], keep=False)
        if not mask_dup.any():
            return df, 0, 0, detalle_vacio

        columnas_id = [c for c in ('ID SIAL', 'CUIL Y ROL', 'AYN') if c in df.columns]
        columnas_nucleo = [
            c for c in COLUMNAS_NUCLEO_COMPLETITUD if c in df.columns and c not in columnas_id
        ]
        vacios_por_fila = df[columnas_nucleo].apply(lambda col: col.map(_vacio)).sum(axis=1)

        indices_a_eliminar = []
        detalle_filas = []
        grupos = df.loc[mask_dup].groupby(columna_id).groups
        for id_sial, indices in grupos.items():
            # df conserva el índice original (RangeIndex) en este punto del pipeline, así que el
            # propio índice ya refleja el orden de aparición en el archivo de origen
            orden = sorted(indices, key=lambda i: (vacios_por_fila[i], i))
            idx_conservado = orden[0]
            fila_conservada = df.loc[idx_conservado]
            for idx in orden[1:]:
                indices_a_eliminar.append(idx)
                fila_descartada = df.loc[idx]
                columnas_distintas = [
                    c for c in df.columns
                    if c != columna_id
                    and str(fila_descartada.get(c)) != str(fila_conservada.get(c))
                ]
                valor = f"ID SIAL {id_sial}: fila descartada por duplicado"
                if columnas_distintas:
                    valor += f" (difería en: {', '.join(columnas_distintas)})"
                detalle_filas.append({
                    'CUIL Y ROL': fila_descartada.get('CUIL Y ROL'),
                    'AYN': fila_descartada.get('AYN'),
                    'VALOR': valor,
                })

        df_resultado = df.drop(index=indices_a_eliminar).reset_index(drop=True)
        detalle_df = pd.DataFrame(detalle_filas, columns=['CUIL Y ROL', 'AYN', 'VALOR'])
        cantidad_grupos = df.loc[mask_dup, columna_id].nunique()

        return df_resultado, cantidad_grupos, len(indices_a_eliminar), detalle_df

    def _detectar_jefaturas_duplicadas(self, df):
        """Detecta personas con dos roles ACTIVOS del mismo tipo de jefatura CPH en el mismo
        efector. El rol válido es el que tiene CODIGO JEFATURAS con valor; el que tiene
        CODIGO JEFATURAS vacío es el error de origen que hay que pedir que corrijan en SIAL.

        Devuelve un DataFrame con una fila por rol erróneo (CUIL Y ROL, AYN, VALOR con el
        detalle del problema), listo para incluir en el reporte de calidad.
        """
        cols_necesarias = {'CUIL', 'SIGLAS', 'LITERAL PUESTO', 'ESTADO', 'CODIGO JEFATURAS',
                           'JEFE ESCALAFON', 'ID SIAL'}
        if not cols_necesarias.issubset(df.columns):
            return pd.DataFrame(columns=['CUIL Y ROL', 'AYN', 'VALOR'])

        # Solo jefes CPH activos
        mask_jefe_cph_activo = (
            df['JEFE ESCALAFON'].isin(['JEFE CPH POF', 'JEFE CPH POU'])
            & (df['ESTADO'].str.upper() == 'ACTIVO')
        )
        jefes = df.loc[mask_jefe_cph_activo].copy()

        if jefes.empty:
            return pd.DataFrame(columns=['CUIL Y ROL', 'AYN', 'VALOR'])

        # Grupos con mas de un rol activo del mismo tipo en el mismo efector
        grupos = jefes.groupby(['CUIL', 'SIGLAS', 'LITERAL PUESTO'])
        filas_error = []
        for (cuil, sigla, puesto), grupo in grupos:
            if len(grupo) < 2:
                continue
            # Rol valido: tiene CODIGO JEFATURAS con valor
            # Rol error:  CODIGO JEFATURAS vacio
            def _vacio(v):
                return pd.isna(v) or str(v).strip() == ''

            for _, fila in grupo.iterrows():
                if _vacio(fila.get('CODIGO JEFATURAS')):
                    id_sial_valido = ', '.join(
                        str(r['ID SIAL']) for _, r in grupo.iterrows()
                        if not _vacio(r.get('CODIGO JEFATURAS'))
                    )
                    filas_error.append({
                        'CUIL Y ROL': fila.get('CUIL Y ROL'),
                        'AYN': fila.get('AYN'),
                        'ID SIAL': fila.get('ID SIAL'),
                        'VALOR': (
                            f"[{sigla}] {puesto}: rol duplicado sin CODIGO JEFATURAS — "
                            f"ID SIAL eliminado del resultado: {fila.get('ID SIAL')} "
                            f"(rol valido: {id_sial_valido})"
                        ),
                    })

        return pd.DataFrame(filas_error, columns=['CUIL Y ROL', 'AYN', 'ID SIAL', 'VALOR'])

    def _reordenar_columnas(self, df):
        """Reordena las columnas según el orden del archivo de referencia (DOTACION 1-12-25 MSGC.xlsx)"""
        # Orden basado en: archivo de referencia manual
        orden_esperado = [
            'ID SIAL',
            'CUIL',
            'CUIL Y ROL',
            'AYN',
            'FECHA NACIMIENTO',
            'EDAD',
            'SEXO',
            'TIPO DOC',
            'NUMERO DOC',
            'CODIGO REPA',
            'DESCRIPCION REPA',
            'SIGLAS',
            'UNIVERSO TOTALIZADOR',
            'TIPO DE HOSPITAL / SIGLA',
            'MONOVALENCIA',
            'ESCALAFON',
            'CODIGO DE REGISTRO',
            'LITERAL CR',
            'REGIMEN',
            'SITUACION DE REVISTA',
            'PUESTO',
            'LITERAL PUESTO',
            'ESPECIALIDAD',
            'UNIFICADOR DE PUESTOS',
            'AGRUPADOR',
            'CODIGO JEFATURAS',
            'JEFE ESCALAFON',
            'DOCUMENTACION JEFATURA',
            'COMENTARIOS JEFATURAS',
            'ESCRITORIO',
            'POU_DESDE',
            'DIA',
            'DOCUEMNTACION POU',
            'SR_DOC_RESPALD',
            'SR_COMENTARIO',
            'COMISION',
            'REPA COMISION',
            'CR_COMENTARIO',
            'COD_AGRUPAMIENTO',
            'AGRUPAMIENTO',
            'COD_FAMILIA',
            'LIT_FAMILIA',
            'COD SITUACION',
            'TELEFONO',
            'MAIL_PERSONAL',
            'MAIL_LABORAL',
            'DOMICILIO',
            'LOCALIDAD',
            'PROVINCIA',
            'FECHA BLOQUEO',
            'BLOQUEO COMENTARIO',
            'BLOQ MOTIVO',
            'CARGO_DESDE',
            'CARGO_HASTA',
            'DOCUMENTACION DEL ROL',
            'DOCUMENTACION BAJA',
            'ANTIGÜEDAD',
            'ESTADO'
        ]
        
        # Mantener solo las columnas que existen en el dataframe
        columnas_validas = [col for col in orden_esperado if col in df.columns]
        
        # Agregar cualquier columna que no esté en orden_esperado (columnas adicionales)
        otras_columnas = [col for col in df.columns if col not in columnas_validas]
        
        orden_final = columnas_validas + otras_columnas
        
        return df[orden_final]
    
    def guardar_resultado(self, ruta_salida):
        """Guarda el resultado en Excel"""
        try:
            self.resultado_df.to_excel(ruta_salida, index=False, sheet_name='Dotacion')
            return True, f"Archivo guardado en: {ruta_salida}"
        except PermissionError:
            return False, (
                f"No se pudo guardar porque el archivo está abierto en otro programa (ej. Excel).\n"
                f"Cerralo e intentá de nuevo:\n{ruta_salida}"
            )
        except Exception as e:
            return False, f"Error al guardar: {str(e)}"

    def calcular_completitud(self):
        """Audita completitud de datos en dos niveles:
        - Por columna: TODAS las columnas de resultado_df, sin filtrar (sirve para ver de un
          vistazo la forma de los datos, incluidas las columnas opcionales por diseño).
        - Por fila: solo las columnas de COLUMNAS_NUCLEO_COMPLETITUD, las que se definieron con
          el usuario como las que deberian tener dato siempre (a diferencia de COMISION,
          ESCRITORIO, BLOQ MOTIVO, etc. que son opcionales y solo aplican a una parte del
          personal, y por eso quedan afuera de este chequeo fila por fila).

        Devuelve (completitud_columna, completitud_fila):
        - completitud_columna: una fila por columna, con cuantas celdas estan vacias y el %.
        - completitud_fila: una fila por CADA REGISTRO CON AL MENOS UNA COLUMNA NUCLEO VACIA (los
          completos no aparecen), identificado por ID SIAL / CUIL Y ROL / AYN, con la cantidad de
          columnas vacias y el listado de cuales, ordenado de mas a menos incompleto."""
        df = self.resultado_df

        def _vacio(valor):
            if pd.isna(valor):
                return True
            return isinstance(valor, str) and valor.strip() == ''

        mask_vacio = df.apply(lambda col: col.map(_vacio))

        total = len(df)
        completitud_columna = pd.DataFrame([
            {
                'Columna': col,
                'Filas vacías': int(mask_vacio[col].sum()),
                '% vacío': round(100 * mask_vacio[col].sum() / total, 1) if total else 0,
            }
            for col in df.columns
        ])

        columnas_id = [c for c in ('ID SIAL', 'CUIL Y ROL', 'AYN') if c in df.columns]
        columnas_nucleo = [
            c for c in COLUMNAS_NUCLEO_COMPLETITUD if c in df.columns and c not in columnas_id
        ]

        mask_nucleo = mask_vacio[columnas_nucleo].copy()
        # ESPECIALIDAD solo cuenta como vacia si el Codigo de Registro es 37/23/24 (unica
        # categoria con especialidad definida); para el resto, estar vacia es lo esperado y no
        # un problema, igual criterio que ya usa el resto de la app (resumen_cobertura, etc.)
        if 'ESPECIALIDAD' in mask_nucleo.columns and 'CODIGO DE REGISTRO' in df.columns:
            cod_reg_str = df['CODIGO DE REGISTRO'].astype(str).str.strip()
            tiene_categoria_especialidad = cod_reg_str.isin(['37', '23', '24'])
            mask_nucleo['ESPECIALIDAD'] = mask_nucleo['ESPECIALIDAD'] & tiene_categoria_especialidad

        cantidad_vacias = mask_nucleo.sum(axis=1)
        columnas_vacias = mask_nucleo.apply(
            lambda fila: ', '.join(col for col, vacio in fila.items() if vacio), axis=1
        )

        completitud_fila = df[columnas_id].copy()
        completitud_fila['CANTIDAD DE COLUMNAS VACÍAS'] = cantidad_vacias
        completitud_fila['COLUMNAS VACÍAS'] = columnas_vacias
        completitud_fila = completitud_fila[completitud_fila['CANTIDAD DE COLUMNAS VACÍAS'] > 0]
        completitud_fila = completitud_fila.sort_values('CANTIDAD DE COLUMNAS VACÍAS', ascending=False)

        return completitud_columna, completitud_fila

    def generar_reporte_calidad_excel(self, ruta_salida):
        """Exporta un Excel con el detalle fila por fila de todos los problemas de calidad
        detectados (SIGLA / UNIFICADOR DE PUESTOS / AGRUPADOR sin coincidencia, ESPECIALIDAD
        vaciada o sin puesto), mas una auditoria general de completitud de datos:
        - 'Resumen': cantidad de valores distintos y de filas afectadas por cada tipo de cruce.
        - 'Detalle': una fila por cada registro afectado por un cruce (CUIL Y ROL / AYN).
        - 'Completitud por columna': cuantas celdas estan vacias en cada columna, de todo el
          archivo (no solo las que entran en un cruce).
        - 'Completitud por fila': cada registro con al menos una columna vacia, con el listado
          exacto de cuales, para revisar cargo por cargo."""
        try:
            filas_resumen = []
            partes_detalle = []
            for problema, detalle in self.detalle_calidad.items():
                filas_afectadas = len(detalle)
                valores_distintos = detalle['VALOR'].nunique() if 'VALOR' in detalle.columns and filas_afectadas else 0
                filas_resumen.append({
                    'Problema': problema,
                    'Filas afectadas': filas_afectadas,
                    'Valores distintos': valores_distintos,
                })
                if filas_afectadas:
                    parte = detalle.copy()
                    parte.insert(0, 'PROBLEMA', problema)
                    partes_detalle.append(parte)

            resumen_df = pd.DataFrame(filas_resumen, columns=['Problema', 'Filas afectadas', 'Valores distintos'])
            detalle_df = pd.concat(partes_detalle, ignore_index=True) if partes_detalle else pd.DataFrame(
                columns=['PROBLEMA', 'CUIL Y ROL', 'AYN', 'VALOR']
            )

            completitud_columna_df, completitud_fila_df = self.calcular_completitud()

            with pd.ExcelWriter(ruta_salida, engine='openpyxl') as writer:
                resumen_df.to_excel(writer, sheet_name='Resumen', index=False)
                detalle_df.to_excel(writer, sheet_name='Detalle', index=False)
                completitud_columna_df.to_excel(writer, sheet_name='Completitud por columna', index=False)
                completitud_fila_df.to_excel(writer, sheet_name='Completitud por fila', index=False)

            return True, f"Reporte de calidad guardado en: {ruta_salida}"
        except PermissionError:
            return False, (
                f"No se pudo guardar porque el archivo está abierto en otro programa (ej. Excel).\n"
                f"Cerralo e intentá de nuevo:\n{ruta_salida}"
            )
        except Exception as e:
            return False, f"Error al generar el reporte de calidad: {str(e)}"

