import type { Periodo } from './periodo'

// Período activo del deck. Hoy fijo en el cuatrimestre May–Ago 2026 (el que
// está trabajando el diseñador). Cuando exista el backend, este valor saldrá de
// un selector de período / de la respuesta del endpoint, y nada más cambia:
// las slides ya se generan a partir del período que reciban.
export const PERIODO_ACTUAL: Periodo = {
  anio: 2026,
  meses: [5, 6, 7, 8], // Mayo, Junio, Julio, Agosto
}
