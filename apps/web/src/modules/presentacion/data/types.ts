// ─────────────────────────────────────────────────────────────────────────────
// Contratos de datos de la presentación.
//
// Cada slide declara acá la *forma* de los datos que necesita, independiente de
// la UI y de la fuente. Hoy los llena un mock (ver *.mock.ts); mañana un
// endpoint del sistema main devuelve exactamente esta forma y el componente no
// cambia. Esa es la "ductibilidad": el componente depende del tipo, no del
// origen.
//
// Todo el reporte se genera para un `Periodo` (ver periodo.ts): el deck elige
// uno y las funciones build*(periodo) producen estos datos ya rotulados con ese
// período. El backend hará exactamente lo mismo.
// ─────────────────────────────────────────────────────────────────────────────

import type { Periodo } from './periodo'

export type { Periodo }

/** Un KPI numérico con etiqueta (ej: "Agosto '26" → 42390). */
export interface Kpi {
  label: string
  /** Valor ya calculado. null = sin dato todavía (el backend aún no lo trae). */
  value: number | null
  /**
   * Texto ya formateado a mostrar en lugar de `value` (ej: "1,48 %"). Útil para
   * KPIs que no son un entero (porcentajes). Si se omite, se formatea `value`.
   */
  displayValue?: string
  /**
   * Variante visual del KPI:
   * - 'neutro'      caja gris clara
   * - 'base'        caja oscura (navy) — ej: "Cargos" en la S6
   * - 'baseGris'    caja gris oscura — ej: valor inicial del bloque decreciente
   * - 'destacado'   caja verde (valor "actual" que sube)
   * - 'negativo'    caja roja (valor "actual" que baja, o resumen negativo)
   * - 'diferencia'  caja-resumen neutra de la derecha (Cantidad / Porcentaje)
   */
  tono?: 'neutro' | 'base' | 'baseGris' | 'destacado' | 'negativo' | 'diferencia'
}

/**
 * Fila genérica de una tabla de variación. Las columnas de meses son dinámicas
 * (una tabla puede ser Ene–Abr y otra May–Ago), por eso `valores` es un mapa
 * mes→número en vez de campos fijos.
 */
export interface FilaVariacion {
  /** Etiqueta de la fila (ej: "Activo", "Enfermería", "SAME"). */
  etiqueta: string
  /** Segunda etiqueta opcional (ej: el "Tipo" en la tabla por Universo). */
  subEtiqueta?: string
  /**
   * Valor de la columna fija previa a los meses (ej: "Cargos" en la S6). Sólo
   * se muestra si la tabla define `columnaValorPrevio`.
   */
  valorPrevio?: number | null
  /** Valores por mes, en el mismo orden que `meses` de la tabla. */
  valores: (number | null)[]
  /** Diferencia (último − primero, o lo que defina el negocio). */
  diferencia: number | null
  /** Variación porcentual del cuatrimestre. */
  variacionPct: number | null
  /** Marca la fila de totales para estilarla distinto. */
  esTotal?: boolean
}

/** Una tabla de variación completa (encabezado + meses + filas). */
export interface TablaVariacion {
  /** Título lateral vertical (ej: "Variación por Estado"). */
  titulo: string
  /** Subtítulo sobre la tabla (ej: "% VARIACIÓN TRIM. EFECTOR EN PLANTA"). */
  subtitulo?: string
  /** Encabezado de la primera columna (ej: "Estado", "Código de Registro"). */
  columnaEtiqueta: string
  /** Encabezado opcional de la segunda columna (ej: "Tipo"). */
  columnaSubEtiqueta?: string
  /**
   * Encabezado de la columna fija numérica previa a los meses (ej: "Cargos" en
   * la S6). Si se define, cada fila usa `valorPrevio`.
   */
  columnaValorPrevio?: string
  /** Nombres de los meses/columnas de valores (ej: ["Enero","Febrero",...]). */
  meses: string[]
  /** Título que agrupa las columnas de meses (ej: "Valores 2026"). */
  tituloValores?: string
  /**
   * Decimales de la columna %. Por defecto 2 ("0,11 %"); 0 muestra "25 %".
   * Lo decide el diseño de cada slide (S4 usa 2, S5 usa 0).
   */
  decimalesPct?: number
  /** Nota al pie de la tabla (ej: "*…únicos que POSEEN VARIACIÓN"). */
  notaPie?: string
  filas: FilaVariacion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla genérica por columnas (TablaColumnas).
//
// Para slides cuyo layout de columnas no entra en TablaVariacion (ej: S7, con
// subcolumnas Cargos/Activos agrupadas por mes). Las columnas se declaran
// explícitamente; cada fila es un mapa clave→valor. CLAVE del requerimiento:
// cualquier columna puede marcarse `oculta` — el dato sigue en la fila (listo
// para el backend) pero no se muestra. Así el fuerte visual (comparar primer vs
// último mes) se logra ocultando columnas intermedias sin perder el dato.
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo formatear y alinear el valor de una columna. */
export type FormatoColumna =
  | 'texto' // string tal cual, alineado a la izquierda
  | 'numero' // entero con separador de miles, a la derecha
  | 'porcentaje' // "x,yy %" con color por signo, a la derecha

export interface ColumnaDef {
  /** Clave con la que la fila guarda el valor de esta columna. */
  clave: string
  /** Encabezado visible de la columna (nivel inferior). */
  header: string
  /**
   * Grupo de primer nivel al que pertenece (ej: "Enero"). Columnas con el mismo
   * grupo consecutivo se agrupan bajo un encabezado que las abarca.
   */
  grupo?: string
  /** Formato del valor. Por defecto 'numero'. */
  formato?: FormatoColumna
  /** Decimales si formato='porcentaje' (default 2). */
  decimalesPct?: number
  /**
   * Si true, la columna NO se renderiza (pero el dato permanece en la fila).
   * Pensado para ocultar columnas en la visualización sin tocar los datos.
   */
  oculta?: boolean
}

/** Fila de TablaColumnas: valores por clave de columna. */
export type FilaColumnas = Record<string, string | number | null> & {
  /** Marca la fila como total (estilo destacado). */
  esTotal?: boolean
}

export interface TablaColumnas {
  /** Título lateral vertical (ej: "Variación por Crecimiento"). */
  titulo: string
  /** Subtítulo sobre la tabla. */
  subtitulo?: string
  columnas: ColumnaDef[]
  filas: FilaColumnas[]
  /** Nota al pie de la tabla. */
  notaPie?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Gráfico de barras (GraficoBarras).
// Serie simple de barras verticales con etiqueta y valor. Dúctil: los datos y
// colores vienen por props; el componente sólo dibuja. Útil cuando el reporte
// incluye una visualización (ej: suplentes por mes en la S8).
// ─────────────────────────────────────────────────────────────────────────────

export interface BarraDato {
  /** Etiqueta del eje X (ej: "Enero 2026"). */
  etiqueta: string
  /** Valor de la barra. null = sin dato. */
  valor: number | null
  /** Color de la barra (hex o token). Por defecto navy. */
  color?: string
}

/** Una serie del gráfico agrupado (ej: "Enero"), con su color. */
export interface SerieBarras {
  nombre: string
  color?: string
}

export interface GraficoBarrasData {
  /** Barras de una sola serie (modo simple). Mutuamente excluyente con series/categorias. */
  barras?: BarraDato[]
  /**
   * Modo agrupado: varias series por categoría. `categorias` son los grupos del
   * eje de categorías (ej: "Jefe de Unidad"); `series` define nombre+color de
   * cada barra dentro del grupo (ej: Enero/Febrero/…); `valores[categoria][serie]`.
   */
  categorias?: string[]
  series?: SerieBarras[]
  /** Matriz de valores: una fila por categoría, en el orden de `series`. */
  valores?: (number | null)[][]
  /** Orientación de las barras. Default 'vertical'. */
  orientacion?: 'vertical' | 'horizontal'
  /** Muestra leyenda de series (modo agrupado). Default true si hay series. */
  leyenda?: boolean
  /** Dibuja una línea de tendencia uniendo los topes de las barras (modo simple). */
  lineaTendencia?: boolean
  /** Fuerza el mínimo del eje de valores. Si se omite, se calcula. */
  minY?: number
  /** Fuerza el máximo del eje de valores. Si se omite, se calcula. */
  maxY?: number
  /** Paso de la grilla del eje de valores. */
  pasoY?: number
}

/** Tarjeta-resumen por tipo de universo (ej: APS 2.591 · 6,1%). */
export interface TarjetaResumen {
  etiqueta: string
  value: number | null
  /** Porcentaje de participación sobre el total. */
  participacionPct: number | null
  /** Tono para diferenciar visualmente las tarjetas. */
  tono?: 'oscuro' | 'claro' | 'acento'
}

/** Datos completos de la Slide 4 — "Dotación Activa · Vista General". */
export interface Slide04Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  kpis: Kpi[]
  /** Chips secundarios bajo los KPIs (ej: Febrero / Marzo). */
  kpisSecundarios: Kpi[]
  tablaEstado: TablaVariacion
  tablaEscalafon: TablaVariacion
  tablaUniverso: TablaVariacion
  tarjetas: TarjetaResumen[]
  /** Texto del botón de acción del footer. */
  ctaFooter?: string
}

/**
 * Datos de la Slide 5 — "Dotación Activa · CPH de Planta".
 * Mismo encabezado + KPIs que la S4, pero el cuerpo son dos tablas de variación
 * (por Efector y por Especialidad). Reutiliza Kpi y TablaVariacion.
 */
export interface Slide05Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  kpis: Kpi[]
  kpisSecundarios: Kpi[]
  tablaEfector: TablaVariacion
  tablaEspecialidad: TablaVariacion
}

/**
 * Datos de la Slide 6 — "Dotación Activa · CPH de Guardia · Jefes incluidos".
 * Igual que la S5 pero con un tercer renglón de título (`subtitulo2`) y dos
 * tablas de variación con columna fija "Cargos" (crecimiento / decrecimiento).
 */
export interface Slide06Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  /** Tercer renglón bajo la banda del título (ej: "Jefes incluidos"). */
  subtitulo2?: string
  kpis: Kpi[]
  kpisSecundarios: Kpi[]
  tablaCrecimiento: TablaVariacion
  tablaDecrecimiento: TablaVariacion
}

/**
 * Datos de la Slide 7 — "Dotación Activa · CPH de Guardia · Por Efector y Tipo".
 * Como la S6 pero con un sub-rótulo en banda ("Por Efector y Tipo") y dos tablas
 * genéricas por columnas (subcolumnas Cargos/Activos agrupadas por mes).
 */
export interface Slide07Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  subtitulo2?: string
  /** Rótulo en banda negra sobre las tablas (ej: "Por Efector y Tipo"). */
  rotulo?: string
  kpis: Kpi[]
  kpisSecundarios: Kpi[]
  tablaCrecimiento: TablaColumnas
  tablaDecrecimiento: TablaColumnas
}

/**
 * Bloque de KPIs comparativos (base → actual → resumen) con sentido propio.
 * La S8 muestra dos: uno que sube (activos) y uno que baja (suplentes).
 */
export interface BloqueKpi {
  kpis: Kpi[]
  kpisSecundarios: Kpi[]
  sentido: 'sube' | 'baja'
  /** Etiqueta/badge sobre el bloque (ej: "DOTACIÓN TOTAL", "JEFES"). */
  etiqueta?: string
  /** Tono del badge de etiqueta. */
  etiquetaTono?: 'amarillo' | 'rojo' | 'navy'
}

/**
 * Datos de la Slide 8 — "Dotación Activa · Suplentes de Guardia".
 * Dos bloques de KPIs comparativos (crecimiento / decrecimiento) y un gráfico
 * de barras (suplentes por mes).
 */
export interface Slide08Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  subtitulo2?: string
  bloques: BloqueKpi[]
  grafico: GraficoBarrasData
}

/**
 * Datos de la Slide 9 — "Dotación Activa · Cargos de estructura · CPH · Jefes".
 * KPIs comparativos + gráfico de barras agrupadas (evolución de activos por
 * jefatura) + tabla de variación por efector (con columna "Cargos").
 */
export interface Slide09Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  subtitulo2?: string
  kpis: Kpi[]
  kpisSecundarios: Kpi[]
  /** Título lateral vertical del gráfico (ej: "Evolución activos"). */
  tituloGrafico?: string
  grafico: GraficoBarrasData
  tablaEfector: TablaVariacion
}

/**
 * Datos de la Slide 10 — "Dotación Activa · Enfermería".
 * Dos bloques de KPIs (dotación total / jefes) + gráfico de barras agrupadas
 * (variación en el tiempo por tipo) + tabla de variación por efector.
 */
export interface Slide10Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  bloques: BloqueKpi[]
  tituloGrafico?: string
  subtituloGrafico?: string
  grafico: GraficoBarrasData
  tablaEfector: TablaVariacion
}

/**
 * Datos de la Slide 11 — "Dotación Activa · Técnicos de la Salud".
 * Misma forma que la S10 (dos bloques KPI + gráfico + tabla por efector); el
 * gráfico es de barras simples con línea de tendencia ("Evolución de activos").
 */
export interface Slide11Data {
  /** Período del reporte al que corresponden estos datos. */
  periodo: Periodo
  tag: string
  titulo: string
  subtitulo: string
  bloques: BloqueKpi[]
  tituloGrafico?: string
  subtituloGrafico?: string
  grafico: GraficoBarrasData
  tablaEfector: TablaVariacion
}
