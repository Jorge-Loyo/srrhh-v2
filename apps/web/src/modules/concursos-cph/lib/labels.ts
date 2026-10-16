import { EstadoConcursoCph } from '@srrhh/types'

// Compartido entre ConcursosCphPage (S4-7) y ConcursoCphDetail (S4-8) — ver
// comentarios de origen de cada lista en concursosCph.calc.ts (backend).

export const ESTADO_LABEL: Record<EstadoConcursoCph, string> = {
  [EstadoConcursoCph.NO_INICIADO]: 'No iniciado',
  [EstadoConcursoCph.ACTIVO]: 'Activo',
  [EstadoConcursoCph.FINALIZADO]: 'Finalizado',
  [EstadoConcursoCph.SUSPENDIDO]: 'Suspendido',
}

export const ESTADO_BADGE: Record<EstadoConcursoCph, string> = {
  [EstadoConcursoCph.NO_INICIADO]: 'badge-default',
  [EstadoConcursoCph.ACTIVO]: 'badge-info',
  [EstadoConcursoCph.FINALIZADO]: 'badge-success',
  [EstadoConcursoCph.SUSPENDIDO]: 'badge-warning',
}

// PS16D-7: badge especial para concursos suspendidos con sub-estado q-desierto
// El sub_estado llega de la BD en minúscula; se compara en minúscula.
export function estadoBadge(estado: EstadoConcursoCph, subEstado: string | null): string {
  if (estado === EstadoConcursoCph.SUSPENDIDO && subEstado === 'q-desierto') return 'badge-danger'
  return ESTADO_BADGE[estado]
}

export function estadoLabel(estado: EstadoConcursoCph, subEstado: string | null): string {
  if (estado === EstadoConcursoCph.SUSPENDIDO && subEstado === 'q-desierto') return 'Desierto'
  return ESTADO_LABEL[estado]
}

// Mismo orden y mismos 19 valores que calcSubEstado() en
// apps/api/.../concursos-cph/concursosCph.calc.ts (de "no arrancado" a
// "cerrado"), para listar las etapas en progresión real en vez de alfabético.
// `value` = código en MINÚSCULA (igual a la BD / lo que se envía como filtro);
// `label` = texto legible para presentación.
export const SUB_ESTADO_OPTIONS: { value: string; label: string }[] = [
  { value: 'no iniciado', label: 'No iniciado' },
  { value: 'vacante', label: 'Vacante' },
  { value: 'a-caratulado', label: 'A — Caratulado' },
  { value: 'a-autzn', label: 'A — Autorización' },
  { value: 'b-sorteo jur', label: 'B — Sorteo de jurado' },
  { value: 'c-dispo de llamado', label: 'C — Dispo de llamado' },
  { value: 'd-examen publicado', label: 'D — Publicación Examen' },
  { value: 'e-orden de merito', label: 'E — Orden de mérito' },
  { value: 'f-ifacs', label: 'F — IFACS' },
  { value: 'g-insal', label: 'G — INSAL' },
  { value: 'h-tad', label: 'H — TAD' },
  { value: 'i-carga docu', label: 'I — Carga documentación' },
  { value: 'j-apto med', label: 'J — Apto médico' },
  { value: 'k-ite', label: 'K — ITE' },
  { value: 'l-pycto de reso', label: 'L — Proyecto resolución' },
  { value: 'm-reso a la firma', label: 'M — Reso a la firma' },
  { value: 'n-designado', label: 'N — Designado' },
  { value: 'o-alta sial', label: 'O — Alta SIAL' },
  { value: 'q-desierto', label: 'Q — Desierto' },
]

// Igual, para calcSubEstado3() — la vista "resumida" de 8 etapas.
export const SUB_ESTADO_3_OPTIONS: { value: string; label: string }[] = [
  { value: 'a-valid. vcte', label: 'Vacante validada' },
  { value: 'b-autorizado', label: 'Autorizado' },
  { value: 'c-inscripcion', label: 'Inscripción' },
  { value: 'd-etapa eval', label: 'Etapa evaluación' },
  { value: 'e-adjudi', label: 'Adjudicación' },
  { value: 'f-prox. a desig', label: 'Próx. a designación' },
  { value: 'g-resolucion', label: 'Resolución' },
  { value: 'h-desierto', label: 'Desierto' },
]

// Helpers de presentación: resuelven el label legible a partir del valor
// interno (minúscula). Fallback al valor crudo si no está catalogado, '—' si null.
const SUB_ESTADO_LABEL = new Map(SUB_ESTADO_OPTIONS.map((o) => [o.value, o.label]))
const SUB_ESTADO_3_LABEL = new Map(SUB_ESTADO_3_OPTIONS.map((o) => [o.value, o.label]))
export const subEstadoLabel = (v: string | null | undefined): string =>
  v ? (SUB_ESTADO_LABEL.get(v) ?? v) : '—'
export const subEstado3Label = (v: string | null | undefined): string =>
  v ? (SUB_ESTADO_3_LABEL.get(v) ?? v) : '—'

// Indicador visual de "sin movimiento" — usado en la tabla de ConcursosCphPage
// y en AlertasSinMovimiento (S4-10) para colorear según hace cuánto no se toca el registro.
export function diasSinMovimiento(updatedAt: string): number {
  const ms = Date.now() - new Date(updatedAt).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function diasBadgeClass(dias: number): string {
  if (dias >= 60) return 'badge-danger'
  if (dias >= 30) return 'badge-warning'
  return 'badge-default'
}
