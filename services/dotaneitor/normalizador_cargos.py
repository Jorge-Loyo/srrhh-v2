"""
Normalizacion de Cargos_Salud: limpieza columna por columna revisada a mano contra los datos
reales (no son reglas genericas adivinadas). Cubre:
- Texto codificado dos veces en UTF-8 (ej. "Ã³" en vez de "ó"), muy frecuente en DOMICILIO y
  LOCALIDAD (mas de la mitad de las filas).
- Espacios dobles/al borde y el artefacto de Excel "_x000D_" en campos de comentario.
- LIT_COD_REG con el simbolo "|" pegado adelante.
- Columnas de fecha con hora "0:00:00" pegada (se deja solo la fecha).
- TELEFONO con "+", espacios, codigo de pais o el "0" antiguo del codigo de area.
- AYN a Formato Titulo ("Apellido, Nombre"), respetando conectores en minuscula (de, del, la...).
- MAIL_PERSONAL / MAIL_LABORAL en minuscula.
"""
import re

import pandas as pd

from consolidacion_lit_puesto import normalizar_lit_puesto

# Valores por defecto (fallback si BD no está disponible al importar el módulo).
# Se sobreescriben llamando a cargar_tablas_ref(engine) desde main.py al arrancar.
CONECTORES_MINUSCULA = {
    'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'por', 'para', 'con', 'sin', 'a', 'al', 'o',
}
SUFIJOS_ORDINALES = {'er', 'ero', 'do', 'da', 'ro', 'ra', 'to', 'ta', 'vo', 'va', 'mo', 'ma', 'no', 'na'}
ABREVIATURAS_TECNICAS = {
    'SECC', 'UNID', 'DIV', 'DEPT', 'GO', 'SGO', 'SS', 'SGA', 'CESAC', 'CESACS', 'SUP', 'SDHOS',
    'CEETPS', 'NCE', 'SAME', 'UCO', 'CODEI', 'CYMAT', 'EDUC',
    'HOSP', 'INST', 'MAT', 'COMP', 'HTAL', 'CTRO', 'MANT', 'EPID', 'ASIST', 'RESID', 'GUAR', 'TEC',
    'PEDIAT', 'UPE', 'CPH', 'UTI', 'ACV', 'USOVNI', 'SARIP', 'CADEA', 'SADOFE', 'IT', 'PG', 'DG',
    'TM', 'TT', 'TN', 'MS', 'CEMAR', 'RR', 'HH', 'SECR', 'APS',
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV',
    'HGNRG', 'HGACA', 'HGADS', 'HGAJAF', 'HGARM', 'HGACD', 'HGAPP', 'HGAIP', 'HGAP', 'HBR', 'HGATA',
    'HGNPE', 'HGAT', 'HGAVS', 'HGAZ', 'GCABA', 'MSGC', 'SIAL', 'SIGEHOS',
}
ABREVIATURAS_TITULO = {'DRA', 'PROF', 'MED', 'DIR', 'LIC'}


def cargar_tablas_ref(engine):
    """Carga CONECTORES_MINUSCULA, SUFIJOS_ORDINALES, ABREVIATURAS_TECNICAS y
    ABREVIATURAS_TITULO desde Postgres. Llamar desde main.py al arrancar."""
    global CONECTORES_MINUSCULA, SUFIJOS_ORDINALES, ABREVIATURAS_TECNICAS, ABREVIATURAS_TITULO
    from sqlalchemy import text
    with engine.connect() as conn:
        CONECTORES_MINUSCULA = {
            r[0] for r in conn.execute(text(
                "SELECT conector FROM ref_conectores_minuscula WHERE activo = true"
            ))
        }
        SUFIJOS_ORDINALES = {
            r[0] for r in conn.execute(text(
                "SELECT sufijo FROM ref_sufijos_ordinales WHERE activo = true"
            ))
        }
        ABREVIATURAS_TECNICAS = {
            r[0] for r in conn.execute(text(
                "SELECT sigla FROM ref_abreviaturas_tecnicas WHERE activo = true"
            ))
        }
        ABREVIATURAS_TITULO = {
            r[0] for r in conn.execute(text(
                "SELECT titulo FROM ref_abreviaturas_titulo WHERE activo = true"
            ))
        }


COLUMNAS_FECHA = ['FEC_NACIM', 'BLOQ_DESDE', 'CARGO_DESDE', 'CARGO_HASTA', 'SALUD_1ER_CARGO', 'POU_DESDE']
COLUMNAS_EMAIL = ['MAIL_PERSONAL', 'MAIL_LABORAL']

COLUMNAS_VOCABULARIO_TECNICO = [
    'LIT_PUESTO', 'LIT_ESP_CARGO', 'DESC_REP', 'ESCALAFON', 'REGIMEN', 'SIT_REV',
    'LIT_AGRUPAMIENTO', 'LIT_FAMILIA', 'LIT_COD_REG', 'BL_MOTIVO', 'DIA',
    'SR_DESC_WU_COMISION', 'LOCALIDAD', 'DOMICILIO',
]

_PATRON_MOJIBAKE = re.compile('[\xc2\xc3][\x80-\xbf]')


def arreglar_doble_utf8(texto):
    """Repara texto codificado dos veces en UTF-8 (ej. 'Ã³' en vez de 'ó').
    Se repara por fragmento (no la cadena entera) para que un caracter raro suelto en otra
    parte del mismo valor no impida arreglar el resto (ej. domicilios con basura mezclada)."""
    if not isinstance(texto, str) or not texto:
        return texto

    def _reparar_fragmento(match):
        fragmento = match.group(0)
        try:
            return fragmento.encode('latin1').decode('utf-8')
        except (UnicodeDecodeError, UnicodeEncodeError):
            return fragmento

    return _PATRON_MOJIBAKE.sub(_reparar_fragmento, texto)


def limpiar_espacios(texto):
    """Reemplaza el artefacto de Excel '_x000D_', colapsa espacios multiples y recorta bordes."""
    if not isinstance(texto, str):
        return texto
    texto = re.sub(r'_x000[Dd]_', ' ', texto)
    texto = re.sub(r'\s+', ' ', texto)
    return texto.strip()


def limpiar_texto_generico(texto):
    if not isinstance(texto, str):
        return texto
    return limpiar_espacios(arreglar_doble_utf8(texto))


def _capitalizar_palabra(palabra, es_inicio_segmento):
    if not palabra:
        return palabra
    base = palabra.lower()
    if base in CONECTORES_MINUSCULA and not es_inicio_segmento:
        return base
    partes = base.split('-')
    return '-'.join(p[:1].upper() + p[1:] if p else p for p in partes)


def formato_titulo(texto):
    """Convierte 'APELLIDO, NOMBRE' (o variantes) a 'Apellido, Nombre', respetando conectores."""
    if not isinstance(texto, str) or not texto:
        return texto
    segmentos = texto.split(',')
    segmentos_formateados = []
    for segmento in segmentos:
        palabras = [p for p in segmento.strip().split(' ') if p]
        formateadas = [_capitalizar_palabra(p, i == 0) for i, p in enumerate(palabras)]
        segmentos_formateados.append(' '.join(formateadas))
    return ', '.join(segmentos_formateados)


_PATRON_PALABRA_TECNICA = re.compile(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+")


def formato_titulo_tecnico(texto):
    """Formato Titulo para vocabulario controlado (puestos, especialidades, dependencias,
    localidades): no restituye tildes que falten en el dato de origen (si ya la trae, se
    preserva). Preserva abreviaturas institucionales (SECC, DEPT, GCABA, etc.)."""
    if not isinstance(texto, str) or not texto:
        return texto

    def reemplazar(match):
        palabra = match.group(0)
        clave = palabra.upper()
        inicio, fin = match.start(), match.end()

        # Letra suelta pegada a un punto (inicial "J. Perez" o sigla "U.C.O.") se deja tal cual
        pegada_a_punto = (inicio > 0 and texto[inicio - 1] == '.') or (fin < len(texto) and texto[fin] == '.')
        if len(palabra) == 1 and pegada_a_punto:
            return clave

        # Ordinal pegado a un numero (1ER, 2DO, 3ER, 4TO) se deja en minuscula, no se titulariza.
        # Los pisos/departamentos pegados a un numero (6F, 7B, 12A) NO entran aca y siguen de largo.
        if inicio > 0 and texto[inicio - 1].isdigit() and palabra.lower() in SUFIJOS_ORDINALES:
            return palabra.lower()

        # Sufijo de genero pegado con "/" (ej. "Operadores/as") se deja en minuscula. Acotado a los
        # sufijos de genero reales para no atrapar abreviaturas separadas por "/" (ej. "H/C", "Comp./Prof.")
        if inicio > 0 and texto[inicio - 1] == '/' and clave.lower() in {'a', 'o', 'as', 'os', 'es'}:
            return palabra.lower()

        if clave in ABREVIATURAS_TECNICAS:
            return palabra

        if clave in ABREVIATURAS_TITULO:
            return clave[:1] + clave[1:].lower()

        antes = texto[:inicio].rstrip()
        es_inicio = inicio == 0 or antes.endswith(',') or antes.endswith('(') or antes.endswith('-')

        # Una letra suelta al final de la cadena, o pegada a un numero (piso/depto "5A", "7B"),
        # es una etiqueta, no el conector "a"/"e"/"o" (que siempre va seguido de otra palabra
        # y no pegado a un numero).
        es_ultima_palabra = len(palabra) == 1 and texto[fin:].strip() == ''
        es_etiqueta_pegada_a_numero = len(palabra) == 1 and inicio > 0 and texto[inicio - 1].isdigit()

        if (clave.lower() in CONECTORES_MINUSCULA and not es_inicio
                and not es_ultima_palabra and not es_etiqueta_pegada_a_numero):
            return clave.lower()

        partes = clave.lower().split('-')
        return '-'.join(p[:1].upper() + p[1:] if p else p for p in partes)

    return _PATRON_PALABRA_TECNICA.sub(reemplazar, texto)


def limpiar_fecha(valor):
    """Las columnas de fecha vienen 100% como 'dd/mm/aaaa 0:00:00'; se deja solo la fecha."""
    if not isinstance(valor, str):
        return valor
    return valor.split(' ')[0]


def limpiar_telefono(valor):
    """Deja solo digitos, sacando '+', espacios, guiones, el codigo de pais '54' y el '0'
    antiguo del codigo de area cuando sobran digitos. No inventa numeros: los truncados o con
    formato irregular quedan solo limpios de simbolos, sin marca especial."""
    if not isinstance(valor, str):
        return valor
    digitos = re.sub(r'\D', '', valor)
    if not digitos:
        return None
    if digitos.startswith('54') and len(digitos) > 10:
        digitos = digitos[2:]
    if digitos.startswith('0') and len(digitos) > 10:
        digitos = digitos[1:]
    return digitos


def limpiar_lit_cod_reg(valor):
    if not isinstance(valor, str):
        return valor
    return limpiar_texto_generico(valor.replace('|', ''))


def limpiar_email(valor):
    if not isinstance(valor, str):
        return valor
    return limpiar_texto_generico(valor).lower()


class NormalizadorCargos:
    """Aplica la normalizacion completa a un DataFrame de Cargos_Salud y arma un reporte de cambios"""

    def __init__(self):
        self.reporte = {}

    def _aplicar_y_contar(self, df, columna, funcion, etiqueta):
        if columna not in df.columns:
            return
        antes = df[columna]
        despues = antes.apply(funcion)
        cambios = (despues != antes) & ~(despues.isna() & antes.isna())
        n = int(cambios.sum())
        if n:
            self.reporte[f'{columna}: {etiqueta}'] = n
        df[columna] = despues

    def normalizar(self, df):
        df = df.copy()
        self.reporte = {}

        # 1. Codificacion doble + espacios/artefactos en todas las columnas de texto
        columnas_texto = df.select_dtypes(include='object').columns
        for col in columnas_texto:
            self._aplicar_y_contar(df, col, limpiar_texto_generico, 'codificacion/espacios')

        # 2. Fechas: quitar la hora "0:00:00"
        for col in COLUMNAS_FECHA:
            self._aplicar_y_contar(df, col, limpiar_fecha, 'quitar hora')

        # 3. TELEFONO
        self._aplicar_y_contar(df, 'TELEFONO', limpiar_telefono, 'formato')

        # 4. LIT_COD_REG: sacar "|"
        self._aplicar_y_contar(df, 'LIT_COD_REG', limpiar_lit_cod_reg, 'quitar simbolos')

        # 5. AYN: Formato Titulo
        self._aplicar_y_contar(df, 'AYN', formato_titulo, 'formato titulo')

        # 6. LIT_PUESTO: consolidacion de puestos que son el mismo cargo (errores de tipeo,
        # terminologia vieja, texto de mas), algunos segun el Codigo de Registro. Corre antes del
        # paso generico de Formato Titulo (el paso 7 es idempotente sobre estos valores).
        if 'LIT_PUESTO' in df.columns and 'COD_REG' in df.columns:
            antes = df['LIT_PUESTO'].copy()
            df['LIT_PUESTO'] = [
                normalizar_lit_puesto(valor, cod_reg)
                for valor, cod_reg in zip(df['LIT_PUESTO'], df['COD_REG'])
            ]
            cambios = (df['LIT_PUESTO'] != antes) & ~(df['LIT_PUESTO'].isna() & antes.isna())
            if cambios.sum():
                self.reporte['LIT_PUESTO: consolidacion de puestos'] = int(cambios.sum())

        # 7. Vocabulario controlado: Formato Titulo
        for col in COLUMNAS_VOCABULARIO_TECNICO:
            self._aplicar_y_contar(df, col, formato_titulo_tecnico, 'formato titulo')

        # 8. Emails en minuscula
        for col in COLUMNAS_EMAIL:
            self._aplicar_y_contar(df, col, limpiar_email, 'minuscula')

        return df

    def generar_lineas_reporte(self):
        if not self.reporte:
            return ['No se detectaron cambios.']
        return [f'{clave}: {valor} filas modificadas' for clave, valor in self.reporte.items()]
