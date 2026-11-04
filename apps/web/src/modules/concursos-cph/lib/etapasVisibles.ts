// Visibilidad por rol de las etapas del wizard de Concursos CPH.
// Permiso `concursos-cph/tab:<slug>` por etapa. Es SOLO de UI: no altera el
// estado, la validación ni el cálculo de etapa actual del concurso.
import type { Usuario } from '@srrhh/types'
import { can } from '@/shared/lib/can'

export const ETAPA_TAB_SLUG: Record<string, string> = {
  baja: 'baja-apertura',
  autorizacion: 'autorizacion-jurado',
  inscripcion: 'inscripcion-examen-om',
  ifacs_insal: 'ifacs-insal',
  designacion: 'designacion',
}

/** ¿El usuario ve la etapa? En modo nuevo la etapa `baja` siempre es visible (ahí se crea). */
export function puedeVerEtapa(user: Usuario | null | undefined, etapaId: string, esNuevo = false) {
  if (esNuevo && etapaId === 'baja') return true
  const slug = ETAPA_TAB_SLUG[etapaId]
  return !!slug && can(user, 'concursos-cph', `tab:${slug}`)
}

export function etapasVisiblesPara<T extends { id: string }>(
  etapas: T[],
  user: Usuario | null | undefined,
  esNuevo = false,
): T[] {
  return etapas.filter((e) => puedeVerEtapa(user, e.id, esNuevo))
}

/** Primera etapa visible posterior a `numero` que no esté bloqueada. */
export function siguienteVisible<T extends { numero: number; estado: string }>(
  visibles: T[],
  numero: number,
): T | undefined {
  return visibles.find((e) => e.numero > numero && e.estado !== 'bloqueada')
}

/** Última etapa visible anterior a `numero`. */
export function anteriorVisible<T extends { numero: number }>(
  visibles: T[],
  numero: number,
): T | undefined {
  return [...visibles].reverse().find((e) => e.numero < numero)
}
