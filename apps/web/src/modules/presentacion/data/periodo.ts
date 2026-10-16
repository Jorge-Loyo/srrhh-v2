// ─────────────────────────────────────────────────────────────────────────────
// Período del reporte.
//
// Toda la presentación se genera para un PERÍODO (un rango de meses de un año,
// típicamente un cuatrimestre). Hoy el diseñador trabaja sobre May–Ago 2026,
// pero el mismo deck debe servir cualquier rango/año. Por eso el período es un
// dato explícito que fluye deck → slides → tablas, en vez de estar hardcodeado
// en cada mock.
//
// Cuando exista el backend: el usuario elige el período en un selector, se lo
// pasa al endpoint, y la respuesta trae los datos ya rotulados con ese período.
// El front no cambia — sólo cambia de dónde sale el `Periodo`.
// ─────────────────────────────────────────────────────────────────────────────

/** Mes 1–12. */
export type Mes = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export interface Periodo {
  /** Año del reporte (ej: 2026). */
  anio: number
  /**
   * Meses incluidos, en orden (ej: [5,6,7,8] para un cuatrimestre May–Ago).
   * No se asume cantidad fija: puede ser un cuatrimestre, un semestre, etc.
   */
  meses: Mes[]
}

const NOMBRES_MES: Record<Mes, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
}

/** 5 → "Mayo". */
export function nombreMes(m: Mes): string {
  return NOMBRES_MES[m]
}

/** Nombres de los meses del período, en orden (para encabezados de tabla). */
export function nombresMeses(p: Periodo): string[] {
  return p.meses.map(nombreMes)
}

/** 2026 → "26" (año en dos dígitos, para etiquetas tipo "Mayo '26"). */
export function anioCorto(p: Periodo): string {
  return String(p.anio).slice(-2)
}

/** Primer mes del período como Mes (ej: 5). */
export function mesInicio(p: Periodo): Mes {
  return p.meses[0]
}

/** Último mes del período como Mes (ej: 8). */
export function mesFin(p: Periodo): Mes {
  return p.meses[p.meses.length - 1]
}

/** Etiqueta de un mes con año corto: (5, 2026) → "Mayo '26". */
export function etiquetaMesAnio(m: Mes, p: Periodo): string {
  return `${nombreMes(m)} '${anioCorto(p)}`
}

/** Título que agrupa las columnas de valores: "Valores 2026". */
export function tituloValores(p: Periodo): string {
  return `Valores ${p.anio}`
}

/**
 * Meses "intermedios" (todos menos el primero y el último), usados como chips
 * secundarios bajo los KPIs. May–Ago → [Junio, Julio].
 */
export function mesesIntermedios(p: Periodo): Mes[] {
  return p.meses.slice(1, -1)
}
