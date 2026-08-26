import { EstadoConcursoCph } from '@srrhh/types'

// Compartido entre ConcursosCphPage (S4-7) y ConcursoCphDetail (S4-8) — ver
// comentarios de origen de cada lista en concursosCph.calc.ts (backend).

export const ESTADO_LABEL: Record<EstadoConcursoCph, string> = {
  [EstadoConcursoCph.NO_INICIADO]: 'No iniciado',
  [EstadoConcursoCph.ACTIVO]: 'Activo',
  [EstadoConcursoCph.FINALIZADO]: 'Finalizado',
  [EstadoConcursoCph.SUSPENDIDO]: 'Suspendido',
  [EstadoConcursoCph.DESIERTO]: 'Desierto',
}

export const ESTADO_BADGE: Record<EstadoConcursoCph, string> = {
  [EstadoConcursoCph.NO_INICIADO]: 'badge-default',
  [EstadoConcursoCph.ACTIVO]: 'badge-info',
  [EstadoConcursoCph.FINALIZADO]: 'badge-success',
  [EstadoConcursoCph.SUSPENDIDO]: 'badge-warning',
  [EstadoConcursoCph.DESIERTO]: 'badge-danger',
}

// Mismo orden y mismos 19 valores que calcSubEstado() en
// apps/api/.../concursos-cph/concursosCph.calc.ts (de "no arrancado" a
// "cerrado"), para listar las etapas en progresión real en vez de alfabético.
export const SUB_ESTADO_OPTIONS = [
  'NO INICIADO',
  'VACANTE',
  'A-CARATULADO',
  'A-AUTZN',
  'B-SORTEO JUR',
  'C-DISPO DE LLAMADO',
  'D-EXAMEN PUBLICADO',
  'E-ORDEN DE MERITO',
  'F-IFACS',
  'G-INSAL',
  'H-TAD',
  'I-CARGA DOCU',
  'J-APTO MED',
  'K-ITE',
  'L-PYCTO DE RESO',
  'M-RESO A LA FIRMA',
  'N-DESIGNADO',
  'O-ALTA SIAL',
  'Q-DESIERTO',
]

// Igual, para calcSubEstado3() — la vista "resumida" de 8 etapas.
export const SUB_ESTADO_3_OPTIONS = [
  'A-VALID. VCTE',
  'B-AUTORIZADO',
  'C-INSCRIPCION',
  'D-ETAPA EVAL',
  'E-ADJUDI',
  'F-PROX. A DESIG',
  'G-RESOLUCION',
  'H-DESIERTO',
]

// Indicador visual liviano de "sin movimiento" — el sistema de alertas
// completo (umbrales configurables, filtro dedicado) es S4-10, todavía no
// implementado. Acá solo coloreamos según hace cuánto no se toca el registro.
export function diasSinMovimiento(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function diasBadgeClass(dias: number): string {
  if (dias >= 60) return 'badge-danger'
  if (dias >= 30) return 'badge-warning'
  return 'badge-default'
}
