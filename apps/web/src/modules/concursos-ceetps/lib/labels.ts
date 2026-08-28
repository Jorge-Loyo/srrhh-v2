import { EstadoConcursoCeetps } from '@srrhh/types'

// Flujo CEETPS (ver calcEstadoCeetps, apps/api/.../concursos-ceetps.service.ts):
// sin_autorizar → autorizado → en_proceso → finalizado / desierto. Más chato
// que CPH (sin subEstado de 19 niveles) — acá el propio `estado` alcanza para
// mostrar en la tabla, no hace falta un label/badge separado por sub-etapa.

export const ESTADO_LABEL: Record<EstadoConcursoCeetps, string> = {
  [EstadoConcursoCeetps.SIN_AUTORIZAR]: 'Sin autorizar',
  [EstadoConcursoCeetps.AUTORIZADO]: 'Autorizado',
  [EstadoConcursoCeetps.EN_PROCESO]: 'En proceso',
  [EstadoConcursoCeetps.FINALIZADO]: 'Finalizado',
  [EstadoConcursoCeetps.DESIERTO]: 'Desierto',
}

export const ESTADO_BADGE: Record<EstadoConcursoCeetps, string> = {
  [EstadoConcursoCeetps.SIN_AUTORIZAR]: 'badge-default',
  [EstadoConcursoCeetps.AUTORIZADO]: 'badge-info',
  [EstadoConcursoCeetps.EN_PROCESO]: 'badge-primary',
  [EstadoConcursoCeetps.FINALIZADO]: 'badge-success',
  [EstadoConcursoCeetps.DESIERTO]: 'badge-danger',
}

// Mismo indicador de "sin movimiento" que concursos-cph/lib/labels.ts — se
// duplica en vez de importar entre módulos hermanos a propósito (mismo
// criterio que ya separa concursos-cph de concursos-ceetps en el backend:
// carreras distintas, mismo shape de dato por coincidencia, no una relación
// real que justifique acoplarlos).
export function diasSinMovimiento(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function diasBadgeClass(dias: number): string {
  if (dias >= 60) return 'badge-danger'
  if (dias >= 30) return 'badge-warning'
  return 'badge-default'
}
