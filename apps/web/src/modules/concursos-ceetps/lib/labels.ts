import { EstadoConcursoCeetps } from '@srrhh/types'

// Flujo CEETPS (ver calcEstadoCeetps, apps/api/.../concursosCeetps.calc.ts):
// sin_autorizar → autorizado → en_proceso → finalizado / desierto.
// El `estado` principal cubre 5 valores del enum. `subEstado` da granularidad
// dentro de `en_proceso` (y opcionalmente dentro de `sin_autorizar`), espejando
// los 8 estados string del legacy (computeEstadoConcurso en concursalesHelpers.js).

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

// Labels legibles para el sub-estado granular (espeja los estados string del legacy)
export const SUB_ESTADO_LABEL: Record<string, string> = {
  EXP_CARATULADO:    'Exp. caratulado',
  DISPO_LLAMADO:     'Dispo. de llamado',
  IFACS:             'IFACS',
  INSAL:             'INSAL',
  TAD:               'TAD',
  DISPO_DESIGNACION: 'Dispo. de designación',
}

export const SUB_ESTADO_BADGE: Record<string, string> = {
  EXP_CARATULADO:    'badge-default',
  DISPO_LLAMADO:     'badge-info',
  IFACS:             'badge-primary',
  INSAL:             'badge-primary',
  TAD:               'badge-warning',
  DISPO_DESIGNACION: 'badge-warning',
}

// Mismo indicador de "sin movimiento" que concursos-cph/lib/labels.ts — se
// duplica en vez de importar entre módulos hermanos a propósito (mismo
// criterio que ya separa concursos-cph de concursos-ceetps en el backend).
export function diasSinMovimiento(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function diasBadgeClass(dias: number): string {
  if (dias >= 60) return 'badge-danger'
  if (dias >= 30) return 'badge-warning'
  return 'badge-default'
}
