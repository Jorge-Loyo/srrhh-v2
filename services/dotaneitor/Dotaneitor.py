import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import pandas as pd
import openpyxl
from pathlib import Path
import os
import json
import shutil
from datetime import datetime
from threading import Thread
import traceback

from normalizador_cargos import NormalizadorCargos
from especialidades import (
    completar_especialidad, resumen_cobertura,
    limpiar_especialidad_indebida, filas_especialidad_sin_puesto,
)
from especialidad_por_agrupador import completar_especialidad_por_agrupador, sin_tilde_mayuscula, sin_tilde

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
    'LITERAL PUESTO', 'ESPECIALIDAD', 'AGRUPADOR', 'UNIVERSO TOTALIZADOR',
    'TIPO DE HOSPITAL / SIGLA', 'MONOVALENCIA', 'UNIFICADOR DE PUESTOS',
    'JEFE ESCALAFON', 'SITUACION DE REVISTA',
]


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
            
            # Crear diccionario de búsqueda para UNIFICADOR
            unificador_map = {}
            for idx, row in self.unificador_df.iterrows():
                cruce = str(row['Cruce'])
                unificador_map[cruce] = row.get('UNIFICADOR DE PUESTO')
            
            df['UNIFICADOR DE PUESTOS'] = df['CRUCE_UNIFICADOR'].map(unificador_map)

            mask_sin_unificador = ~df['CRUCE_UNIFICADOR'].isin(unificador_map.keys())
            unificador_no_encontrado = sorted(str(c) for c in df.loc[mask_sin_unificador, 'CRUCE_UNIFICADOR'].unique())
            detalle_sin_unificador = df.loc[mask_sin_unificador, ['CUIL Y ROL', 'AYN', 'CRUCE_UNIFICADOR']].rename(
                columns={'CRUCE_UNIFICADOR': 'VALOR'}
            )

            df = df.drop(columns=['CRUCE_UNIFICADOR', 'LIT_COD_REG_LIMPIO'])
            
            # 7. Crear AGRUPADOR
            df['CRUCE_AGRUPADOR'] = df['ESCALAFON'].astype(str) + ' - ' + df['LIT_PUESTO'].astype(str)
            
            # Crear diccionario de búsqueda para AGRUPADOR
            agrupador_map = {}
            for idx, row in self.agrupador_df.iterrows():
                cruce = str(row['CRUCE'])
                agrupador_map[cruce] = row.get('AGRUPADOR')
            
            df['AGRUPADOR'] = df['CRUCE_AGRUPADOR'].map(agrupador_map)

            mask_sin_agrupador = ~df['CRUCE_AGRUPADOR'].isin(agrupador_map.keys())
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
        """Calcula la columna Jefe ESCALAFON según reglas de negocio"""
        result = []
        
        for idx, row in df.iterrows():
            j_cat = row.get('JCAT')
            cod_reg = row.get('COD_REG')
            escritorio = row.get('ESCRITORIO')
            
            # Si no tiene J_CAT, no es jefe
            if pd.isna(j_cat) or j_cat == '':
                result.append(None)
                continue
            
            # Convertir COD_REG a int para comparación (puede ser '37' o 37 o '17B')
            try:
                cod_reg = int(str(cod_reg).replace('B', '').strip()) if not pd.isna(cod_reg) else None
            except:
                cod_reg = None
            
            has_escritorio = not pd.isna(escritorio) and escritorio != ''
            
            if cod_reg == 37:
                if not has_escritorio:
                    result.append('Jefe CPH POF')
                else:
                    result.append('Jefe CPH POU')
            elif cod_reg == 85:
                result.append('Jefe Tecnico')
            elif cod_reg == 87:
                result.append('Jefe Enfermeria')
            elif cod_reg == 83:
                result.append('Jefe Administrativo')
            else:
                result.append(None)
        
        return result
    
    def _calcular_estado(self, df):
        """Calcula la columna estado según reglas de negocio"""
        result = []
        
        for idx, row in df.iterrows():
            sit_rev = row.get('SIT_REV')
            bloq_desde = row.get('BLOQ_DESDE')
            
            # Si tiene bloq_desde con valor, es bloqueado
            if not pd.isna(bloq_desde) and bloq_desde != '':
                result.append('Bloqueado')
            # Si tiene retención de cargo en SIT_REV
            elif not pd.isna(sit_rev) and 'retencion' in str(sit_rev).lower().replace('á', 'a'):
                result.append('Retencion de Cargo')
            # Si tiene comisión en SIT_REV
            elif not pd.isna(sit_rev) and 'comision' in str(sit_rev).lower().replace('ó', 'o'):
                result.append('Comision')
            # Por defecto, activo
            else:
                result.append('Activo')
        
        return result
    
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
            else:
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


class DotacionGUI:
    """Interfaz gráfica para la automatización de dotación"""
    
    def __init__(self, root):
        self.root = root
        self.root.title("Automatización de Dotación")
        self.root.geometry("1050x700")
        self.root.minsize(850, 550)
        self.root.resizable(True, True)

        self.automation = DotacionAutomation()
        self.normalizador = NormalizadorCargos()
        self.ruta_cargos = tk.StringVar()
        self.ruta_archivos_dotacion = tk.StringVar()
        self.config_path = self._obtener_config_path()
        self.config_data = self._cargar_config()

        self._crear_interfaz()

    def _obtener_config_path(self):
        """Devuelve la ruta del archivo de configuracion (ultimas carpetas usadas)"""
        base = Path(os.getenv('APPDATA', str(Path.home())))
        carpeta = base / 'Dotaneitor'
        carpeta.mkdir(parents=True, exist_ok=True)
        return carpeta / 'config.json'

    def _cargar_config(self):
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}

    def _guardar_config(self):
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.config_data, f)
        except Exception:
            pass
    
    def _crear_interfaz(self):
        """Crea los elementos de la interfaz gráfica"""
        
        # Frame principal
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Título + Ayuda
        frame_titulo = ttk.Frame(main_frame)
        frame_titulo.pack(fill=tk.X, pady=(0, 20))

        titulo = ttk.Label(frame_titulo, text="DOTANEITOR", font=("Arial", 14, "bold"))
        titulo.pack(side=tk.LEFT)

        ttk.Button(frame_titulo, text="¿Qué hace cada botón?", command=self._mostrar_ayuda).pack(side=tk.RIGHT)

        # Sección: Cargar Cargos_salud.xlsx
        frame_cargos = ttk.LabelFrame(main_frame, text="1. Cargos_salud", padding="10")
        frame_cargos.pack(fill=tk.X, pady=(0, 15))
        
        ttk.Button(frame_cargos, text="Seleccionar archivo",
                  command=self._seleccionar_cargos).pack(side=tk.LEFT, padx=(0, 10))

        self.label_cargos = ttk.Label(frame_cargos, text="No seleccionado", foreground="gray")
        self.label_cargos.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Sección: Normalizar Cargos_Salud
        frame_normalizar = ttk.LabelFrame(main_frame, text="2. Normalizar Cargos_Salud", padding="10")
        frame_normalizar.pack(fill=tk.X, pady=(0, 15))

        self.btn_normalizar = ttk.Button(frame_normalizar, text="Normalizar",
                  command=self._normalizar_cargos)
        self.btn_normalizar.pack(side=tk.LEFT, padx=(0, 10))

        self.label_normalizar = ttk.Label(frame_normalizar, text="Sin normalizar", foreground="gray")
        self.label_normalizar.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Sección: Cargar Archivos para Dotación
        frame_archivos = ttk.LabelFrame(main_frame, text="3. Archivos para Dotación", padding="10")
        frame_archivos.pack(fill=tk.X, pady=(0, 15))

        ttk.Button(frame_archivos, text="Seleccionar archivo",
                  command=self._seleccionar_archivos_dotacion).pack(side=tk.LEFT, padx=(0, 10))

        self.label_archivos = ttk.Label(frame_archivos, text="No seleccionado", foreground="gray")
        self.label_archivos.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Sección: Procesar
        frame_procesar = ttk.Frame(main_frame)
        frame_procesar.pack(fill=tk.X, pady=(0, 10))

        self.btn_procesar = ttk.Button(frame_procesar, text="Procesar", command=self._procesar,
                  style="Accent.TButton")
        self.btn_procesar.pack(side=tk.LEFT, padx=(0, 10))

        self.btn_cruzar = ttk.Button(frame_procesar, text="Cruzar", command=self._cruzar_especialidades)
        self.btn_cruzar.pack(side=tk.LEFT, padx=(0, 10))

        self.btn_guardar = ttk.Button(frame_procesar, text="Guardar resultado",
                  command=self._guardar_resultado)
        self.btn_guardar.pack(side=tk.LEFT, padx=(0, 10))

        self.btn_reporte_calidad = ttk.Button(frame_procesar, text="Exportar reporte de calidad",
                  command=self._exportar_reporte_calidad)
        self.btn_reporte_calidad.pack(side=tk.LEFT)

        self.botones_accion = [
            self.btn_normalizar, self.btn_procesar, self.btn_cruzar, self.btn_guardar, self.btn_reporte_calidad
        ]

        # Barra de progreso
        self.progress = ttk.Progressbar(main_frame, mode='indeterminate')
        self.progress.pack(fill=tk.X, pady=(0, 15))

        # Notebook con pestañas de Estado y Vista previa
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True, pady=(0, 15))

        self._crear_tab_estado()
        self._crear_tab_preview()

        # Footer
        footer = ttk.Label(main_frame, text="Automatización v1.1", foreground="gray", font=("Arial", 8))
        footer.pack(pady=(10, 0))

    def _mostrar_ayuda(self):
        """Abre un modal con una explicacion breve de que hace cada boton"""
        ventana = tk.Toplevel(self.root)
        ventana.title("Ayuda - Qué hace cada botón")
        ventana.geometry("600x550")
        ventana.transient(self.root)
        ventana.grab_set()

        boton_cerrar = ttk.Button(ventana, text="Cerrar", command=ventana.destroy)
        boton_cerrar.pack(side=tk.BOTTOM, pady=10)

        frame = ttk.Frame(ventana, padding="15")
        frame.pack(fill=tk.BOTH, expand=True)

        scrollbar = ttk.Scrollbar(frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        texto = tk.Text(frame, wrap=tk.WORD, yscrollcommand=scrollbar.set, padx=8, pady=8)
        texto.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=texto.yview)

        texto.tag_config('titulo', font=('Arial', 10, 'bold'), spacing1=12)

        secciones = [
            ("1. Seleccionar Cargos_Salud",
             "Elegís el archivo del padrón (Cargos_salud_AAAAMMDD.xlsx). Si ya habías procesado "
             "algo antes, se limpia el resultado anterior para no confundirlo con uno nuevo."),
            ("2. Normalizar",
             "Limpia el texto de Cargos_Salud: acentos rotos, mayúsculas/minúsculas prolijas, "
             "espacios de más, formato de fechas/teléfono/mail, y unifica nombres de puestos "
             "escritos de varias formas distintas. Sobrescribe el archivo original, pero antes "
             "guarda una copia de respaldo con fecha y hora en la misma carpeta. Es opcional, "
             "pero sin este paso aparecen muchos más problemas de cruce al Procesar."),
            ("3. Seleccionar Archivos para Dotación",
             "Elegís ARCHIVOS PARA DOTACION.xlsx, con las tablas de referencia para los cruces: "
             "AGRUPADOR, UNIFICADOR DE PUESTOS, SIGLAS y las hojas de ESPECIALIDADES."),
            ("Procesar",
             "El paso principal: cruza los dos archivos y arma la Dotación en memoria (todavía "
             "no se guarda a disco). Muestra en la pestaña Estado qué no encontró coincidencia, "
             "y en Vista previa las primeras filas del resultado."),
            ("Cruzar",
             "Completa los huecos de la columna ESPECIALIDAD en dos pasadas, sin pisar nunca un "
             "valor que ya esté cargado. Primero cruza por CUIL contra las hojas de "
             "especialidades de ARCHIVOS PARA DOTACION. Después, para el resto del universo con "
             "especialidad definida (AGRUPADOR Médico / No médico / Residente), completa lo que "
             "siga vacío usando lo que ya está cargado en el propio archivo (CUIL de la misma "
             "persona, y si no, el valor más frecuente para ese mismo puesto). Lo que ni así se "
             "puede derivar (puestos genéricos como \"Profesional Guardia Médico\") queda vacío "
             "a propósito, documentado en el reporte de calidad. Se usa después de Procesar."),
            ("Guardar resultado",
             "Exporta el resultado final (procesado, y cruzado si se usó ese botón) a un Excel "
             "nuevo, con nombre y carpeta a elección."),
            ("Exportar reporte de calidad",
             "Exporta un Excel aparte con el detalle de todo lo que no cerró en los cruces "
             "(SIGLA / UNIFICADOR DE PUESTOS / AGRUPADOR sin coincidencia, ESPECIALIDAD vaciada "
             "o sin puesto): una hoja Resumen con la cantidad de casos, y una hoja Detalle fila "
             "por fila con quién está afectado. Sirve para ir a completar los mapeos que faltan "
             "en ARCHIVOS PARA DOTACION."),
        ]

        for titulo_seccion, descripcion in secciones:
            texto.insert(tk.END, titulo_seccion + "\n", 'titulo')
            texto.insert(tk.END, descripcion + "\n")

        texto.config(state=tk.DISABLED)

    def _crear_tab_estado(self):
        """Crea la pestaña de log de estado"""
        frame_status = ttk.Frame(self.notebook, padding="10")
        self.notebook.add(frame_status, text="Estado")

        scrollbar = ttk.Scrollbar(frame_status)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.text_status = tk.Text(frame_status, height=10, width=80,
                                   yscrollcommand=scrollbar.set, state=tk.DISABLED)
        self.text_status.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.text_status.yview)

        self.text_status.tag_config('warning', foreground='#b36b00')
        self.text_status.tag_config('success', foreground='#1a7a1a')
        self.text_status.tag_config('error', foreground='#b30000')

    def _crear_tab_preview(self):
        """Crea la pestaña de vista previa del resultado procesado"""
        frame_preview = ttk.Frame(self.notebook, padding="10")
        self.notebook.add(frame_preview, text="Vista previa")

        self.label_preview_info = ttk.Label(
            frame_preview,
            text="Procesa los archivos para ver una vista previa del resultado.",
            foreground="gray"
        )
        self.label_preview_info.pack(anchor=tk.W, pady=(0, 10))

        tree_frame = ttk.Frame(frame_preview)
        tree_frame.pack(fill=tk.BOTH, expand=True)

        vsb = ttk.Scrollbar(tree_frame, orient=tk.VERTICAL)
        hsb = ttk.Scrollbar(tree_frame, orient=tk.HORIZONTAL)

        self.tree_preview = ttk.Treeview(
            tree_frame, yscrollcommand=vsb.set, xscrollcommand=hsb.set, show='headings'
        )
        vsb.config(command=self.tree_preview.yview)
        hsb.config(command=self.tree_preview.xview)

        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        hsb.pack(side=tk.BOTTOM, fill=tk.X)
        self.tree_preview.pack(fill=tk.BOTH, expand=True)
    
    def _seleccionar_cargos(self):
        """Abre diálogo para seleccionar archivo Cargos_salud.xlsx"""
        archivo = filedialog.askopenfilename(
            title="Seleccionar Cargos_salud.xlsx",
            filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")],
            initialdir=self.config_data.get('carpeta_cargos', str(Path.home()))
        )

        if archivo:
            self.ruta_cargos.set(archivo)
            self.label_cargos.config(text=Path(archivo).name, foreground="black")
            self._agregar_log(f"✓ Cargado: {Path(archivo).name}")
            self.config_data['carpeta_cargos'] = str(Path(archivo).parent)
            self._guardar_config()
            self.label_normalizar.config(text="Sin normalizar", foreground="gray")
            self._limpiar_resultado()

    def _normalizar_cargos(self):
        """Normaliza el archivo Cargos_Salud seleccionado y sobreescribe el original"""
        ruta = self.ruta_cargos.get()
        if not ruta:
            messagebox.showerror("Error", "Primero selecciona el archivo Cargos_Salud")
            return

        confirmar = messagebox.askyesno(
            "Confirmar normalización",
            f"Esto va a sobreescribir el archivo original:\n{ruta}\n\n"
            "Se guarda antes una copia de respaldo en la misma carpeta.\n\n¿Continuar?"
        )
        if not confirmar:
            return

        self._deshabilitar_botones()
        Thread(target=self._normalizar_cargos_thread, args=(ruta,), daemon=True).start()

    def _normalizar_cargos_thread(self, ruta):
        try:
            self.progress.start(10)
            self._agregar_log("Leyendo Cargos_Salud...")
            try:
                df = pd.read_excel(ruta, sheet_name='Sheet1', dtype=str)
            except PermissionError:
                raise RuntimeError(
                    f"No se pudo leer el archivo porque está abierto en otro programa (ej. Excel).\n"
                    f"Cerralo e intentá de nuevo:\n{ruta}"
                )
            except ValueError as e:
                raise RuntimeError(f"El archivo no tiene la hoja 'Sheet1' esperada ({e})")

            self._agregar_log("Normalizando columnas...")
            df_normalizado = self.normalizador.normalizar(df)

            marca_tiempo = datetime.now().strftime('%Y%m%d_%H%M%S')
            ruta_path = Path(ruta)
            ruta_backup = ruta_path.with_name(f"{ruta_path.stem}_backup_{marca_tiempo}{ruta_path.suffix}")
            try:
                shutil.copy2(ruta, ruta_backup)
            except PermissionError:
                raise RuntimeError(
                    f"No se pudo crear la copia de respaldo porque el archivo está abierto en otro "
                    f"programa (ej. Excel). Cerralo e intentá de nuevo:\n{ruta}"
                )
            self._agregar_log(f"Copia de respaldo creada: {ruta_backup.name}", 'success')

            try:
                df_normalizado.to_excel(ruta, index=False, sheet_name='Sheet1')
            except PermissionError:
                raise RuntimeError(
                    f"No se pudo sobreescribir el archivo porque está abierto en otro programa "
                    f"(ej. Excel). Cerralo e intentá de nuevo. La copia de respaldo ya se creó: "
                    f"{ruta_backup.name}"
                )
            self._agregar_log(f"✓ Archivo normalizado y sobreescrito: {ruta_path.name}", 'success')

            for linea in self.normalizador.generar_lineas_reporte():
                self._agregar_log(linea, 'warning' if 'No se detectaron' not in linea else None)

            self.label_normalizar.config(text="Normalizado", foreground="#1a7a1a")
            messagebox.showinfo("Listo", f"Cargos_Salud normalizado.\nRespaldo: {ruta_backup.name}")
        except Exception as e:
            self._agregar_log(f"✗ Error al normalizar: {str(e)}", 'error')
            messagebox.showerror("Error", f"Error al normalizar:\n{str(e)}")
        finally:
            self.progress.stop()
            self._habilitar_botones()

    def _seleccionar_archivos_dotacion(self):
        """Abre diálogo para seleccionar ARCHIVOS PARA DOTACION.xlsx"""
        archivo = filedialog.askopenfilename(
            title="Seleccionar ARCHIVOS PARA DOTACION.xlsx",
            filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")],
            initialdir=self.config_data.get('carpeta_dotacion', str(Path.home()))
        )

        if archivo:
            self.ruta_archivos_dotacion.set(archivo)
            self.label_archivos.config(text=Path(archivo).name, foreground="black")
            self._agregar_log(f"✓ Cargado: {Path(archivo).name}")
            self.config_data['carpeta_dotacion'] = str(Path(archivo).parent)
            self._guardar_config()
            self._limpiar_resultado()
    
    def _procesar(self):
        """Procesa los archivos"""
        if not self.ruta_cargos.get() or not self.ruta_archivos_dotacion.get():
            messagebox.showerror("Error", "Por favor selecciona ambos archivos")
            return
        
        # Ejecutar en thread para no bloquear la interfaz
        self._deshabilitar_botones()
        Thread(target=self._procesar_thread, daemon=True).start()

    def _procesar_thread(self):
        """Thread para procesar sin bloquear la GUI"""
        try:
            self.progress.start(10)
            self._agregar_log("Cargando archivos...")

            # Cargar archivos
            exito, mensaje = self.automation.cargar_archivos(
                self.ruta_cargos.get(),
                self.ruta_archivos_dotacion.get()
            )

            if not exito:
                self._agregar_log(f"✗ Error: {mensaje}", 'error')
                messagebox.showerror("Error", mensaje)
                return

            self._agregar_log(mensaje)
            self._agregar_log("Procesando transformaciones...")

            # Procesar
            exito, mensaje = self.automation.procesar()

            if not exito:
                self._agregar_log(f"✗ Error: {mensaje}", 'error')
                messagebox.showerror("Error", mensaje)
                return

            self._agregar_log(f"✓ {mensaje}", 'success')

            for linea in self.automation.generar_lineas_reporte_calidad():
                tag = 'warning' if linea.startswith('[!]') else 'success'
                self._agregar_log(linea, tag)

            self._actualizar_preview()
            messagebox.showinfo("Éxito", mensaje)

        except Exception as e:
            self._agregar_log(f"✗ Error inesperado: {str(e)}", 'error')
            messagebox.showerror("Error", f"Error inesperado: {str(e)}")
        finally:
            self.progress.stop()
            self._habilitar_botones()

    def _actualizar_preview(self):
        """Llena la pestaña de vista previa con las primeras filas del resultado"""
        df = self.automation.resultado_df
        if df is None:
            return

        for item in self.tree_preview.get_children():
            self.tree_preview.delete(item)

        columnas = list(df.columns)
        self.tree_preview['columns'] = columnas
        for col in columnas:
            self.tree_preview.heading(col, text=col)
            self.tree_preview.column(col, width=140, stretch=False)

        muestra = df.head(20).fillna('')
        for _, row in muestra.iterrows():
            valores = [str(v) for v in row.tolist()]
            self.tree_preview.insert('', tk.END, values=valores)

        self.label_preview_info.config(
            text=f"Mostrando las primeras {len(muestra)} filas de {len(df)} registros procesados."
        )
        self.notebook.select(1)

    def _cruzar_especialidades(self):
        """Completa los huecos de ESPECIALIDAD cruzando por CUIL + Codigo de Registro"""
        if self.automation.resultado_df is None:
            messagebox.showwarning("Advertencia", "Primero debe procesar los datos")
            return
        if not self.ruta_archivos_dotacion.get():
            messagebox.showerror("Error", "Primero selecciona el archivo ARCHIVOS PARA DOTACION.xlsx")
            return

        self._deshabilitar_botones()
        Thread(target=self._cruzar_especialidades_thread, daemon=True).start()

    def _cruzar_especialidades_thread(self):
        try:
            self.progress.start(10)
            self._agregar_log("Cruzando especialidades por CUIL (solo se completan los huecos)...")

            resultado_completado, consolidador, completados = completar_especialidad(
                self.automation.resultado_df,
                self.ruta_archivos_dotacion.get(),
                columna_especialidad='ESPECIALIDAD',
                columna_cuil='CUIL',
                columna_cod_reg='CODIGO DE REGISTRO',
            )

            for linea in consolidador.generar_lineas_reporte():
                self._agregar_log(linea)
            self._agregar_log(
                f"✓ Huecos completados en ESPECIALIDAD por CUIL (hojas de referencia): {completados}", 'success'
            )

            # Segunda pasada: para el resto del universo con especialidad definida (AGRUPADOR
            # Medico / No medico / cualquier Residente), completa lo que siga vacío usando lo que
            # ya está cargado en el propio archivo (CUIL de la misma persona, y si no, la moda
            # empirica por LITERAL PUESTO) — ver especialidad_por_agrupador.py.
            self._agregar_log(
                "Completando ESPECIALIDAD restante para AGRUPADOR Medico/No medico/Residente "
                "(a partir de los casos ya cargados en el propio archivo)..."
            )
            resultado_completado, resumen_agrupador, detalle_sin_resolver = completar_especialidad_por_agrupador(
                resultado_completado
            )
            self._agregar_log(
                f"✓ Huecos completados por AGRUPADOR: "
                f"{resumen_agrupador['cuil'] + resumen_agrupador['puesto']} "
                f"({resumen_agrupador['cuil']} por CUIL, {resumen_agrupador['puesto']} por puesto)",
                'success'
            )

            # Los huecos que se acaban de completar (ambos pasos) vienen sin forzar mayuscula; se
            # re-fuerza para que queden consistentes con el resto de ESPECIALIDAD (ver
            # COLUMNAS_MAYUSCULA_FORZADA)
            self.automation.resultado_df = self.automation._forzar_mayusculas(resultado_completado)

            for linea in resumen_cobertura(
                self.automation.resultado_df, columna_especialidad='ESPECIALIDAD', columna_cod_reg='CODIGO DE REGISTRO'
            ):
                self._agregar_log(linea)

            self.automation.detalle_calidad[
                'ESPECIALIDAD no derivable (AGRUPADOR Medico/No medico/Residente, sin dato suficiente)'
            ] = detalle_sin_resolver
            if resumen_agrupador['sin_resolver']:
                self._agregar_log(
                    f"[!] ESPECIALIDAD sin poder derivar: {resumen_agrupador['sin_resolver']} fila(s) de "
                    f"puestos genéricos (ej. Profesional Guardia Médico) o con muy poca referencia — se "
                    f"aceptan vacías, quedan documentadas en el reporte de calidad para revisión manual",
                    'warning'
                )

            detalle_sin_puesto = filas_especialidad_sin_puesto(self.automation.resultado_df).rename(
                columns={'ESPECIALIDAD': 'VALOR'}
            )
            self.automation.detalle_calidad['ESPECIALIDAD sin LITERAL PUESTO (revisar manualmente)'] = detalle_sin_puesto
            if len(detalle_sin_puesto):
                ids = detalle_sin_puesto['CUIL Y ROL'].tolist()
                muestra = ', '.join(ids[:5])
                extra = f' (y {len(ids) - 5} mas)' if len(ids) > 5 else ''
                self._agregar_log(
                    f"[!] ESPECIALIDAD sin LITERAL PUESTO: {len(ids)} fila(s) tienen "
                    f"especialidad cargada pero no tienen puesto, revisar (CUIL Y ROL): {muestra}{extra}",
                    'warning'
                )

            self._actualizar_preview()
            messagebox.showinfo("Éxito", "Cruce de especialidades completado")

        except Exception as e:
            self._agregar_log(f"✗ Error al cruzar especialidades: {str(e)}", 'error')
            messagebox.showerror("Error", f"Error al cruzar especialidades:\n{str(e)}")
        finally:
            self.progress.stop()
            self._habilitar_botones()

    def _guardar_resultado(self):
        """Guarda el resultado en Excel"""
        if self.automation.resultado_df is None:
            messagebox.showwarning("Advertencia", "Primero debe procesar los datos")
            return

        archivo_salida = filedialog.asksaveasfilename(
            defaultextension=".xlsx",
            filetypes=[("Excel files", "*.xlsx")],
            initialfile="Dotacion_procesada.xlsx",
            initialdir=self.config_data.get('carpeta_salida', str(Path.home()))
        )

        if archivo_salida:
            exito, mensaje = self.automation.guardar_resultado(archivo_salida)
            self._agregar_log(mensaje, 'success' if exito else 'error')
            if exito:
                self.config_data['carpeta_salida'] = str(Path(archivo_salida).parent)
                self._guardar_config()
                messagebox.showinfo("Éxito", mensaje)
            else:
                messagebox.showerror("Error", mensaje)

    def _exportar_reporte_calidad(self):
        """Exporta a Excel el detalle fila por fila de todos los problemas de calidad
        detectados (resumen + detalle), para revisar o repartir sin depender del log de la app"""
        if self.automation.resultado_df is None:
            messagebox.showwarning("Advertencia", "Primero debe procesar los datos")
            return

        archivo_salida = filedialog.asksaveasfilename(
            defaultextension=".xlsx",
            filetypes=[("Excel files", "*.xlsx")],
            initialfile="Reporte_calidad.xlsx",
            initialdir=self.config_data.get('carpeta_salida', str(Path.home()))
        )

        if archivo_salida:
            exito, mensaje = self.automation.generar_reporte_calidad_excel(archivo_salida)
            self._agregar_log(mensaje, 'success' if exito else 'error')
            if exito:
                self.config_data['carpeta_salida'] = str(Path(archivo_salida).parent)
                self._guardar_config()
                messagebox.showinfo("Éxito", mensaje)
            else:
                messagebox.showerror("Error", mensaje)

    def _deshabilitar_botones(self):
        """Deshabilita los botones de accion mientras corre un thread en background,
        para evitar clicks fuera de orden que pisen resultado_df a mitad de camino."""
        for boton in self.botones_accion:
            boton.config(state=tk.DISABLED)

    def _habilitar_botones(self):
        for boton in self.botones_accion:
            boton.config(state=tk.NORMAL)

    def _limpiar_resultado(self):
        """Descarta el resultado procesado previo (si lo hubiera) para no dejar datos
        obsoletos de un archivo distinto al recien seleccionado."""
        self.automation.resultado_df = None
        for item in self.tree_preview.get_children():
            self.tree_preview.delete(item)
        self.tree_preview['columns'] = ()
        self.label_preview_info.config(
            text="Procesa los archivos para ver una vista previa del resultado.", foreground="gray"
        )

    def _agregar_log(self, mensaje, tag=None):
        """Agrega un mensaje al área de estado"""
        self.text_status.config(state=tk.NORMAL)
        if tag:
            self.text_status.insert(tk.END, f"• {mensaje}\n", tag)
        else:
            self.text_status.insert(tk.END, f"• {mensaje}\n")
        self.text_status.see(tk.END)
        self.text_status.config(state=tk.DISABLED)
        self.root.update()


if __name__ == "__main__":
    root = tk.Tk()
    app = DotacionGUI(root)
    root.mainloop()
