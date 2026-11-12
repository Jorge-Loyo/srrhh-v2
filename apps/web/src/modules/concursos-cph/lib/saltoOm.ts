// ─── Paso 5b: designar desde una orden de mérito existente (salto de etapas) ──
// Funciones puras de UI. La oferta vive en la Etapa 2 (Jurado / Dispo) y la ven
// quienes tienen `concursos-cph/tab:autorizacion-jurado` (admin incluido, sin
// slugs de rol). Tras el salto, las Etapas 2–4 quedan resueltas y la 5 activa.
import type { ConcursoCph, MotivoNoHabilitadoOm, OmDisponible, Usuario } from '@srrhh/types'
import { puedeVerEtapa } from './etapasVisibles'

/** ¿Puede ver/operar la oferta de OM? = el que puede ver la Etapa 2. */
export function puedeOperarOm(user: Usuario | null | undefined): boolean {
  return puedeVerEtapa(user, 'autorizacion')
}

/** Etapas que el salto da por resueltas (jurado, inscripción/examen/OM, IFACS/INSAL). */
const ETAPAS_RESUELTAS_POR_SALTO = ['autorizacion', 'inscripcion', 'ifacs_insal']

/** Con salto registrado: Etapas 2–4 'completada' y Etapa 5 'activa'. Sin salto, sin cambios. */
export function aplicarSaltoOm<T extends { id: string; estado: string }>(
  etapas: T[],
  cph: Pick<ConcursoCph, 'saltoOmAt'> | null | undefined,
): T[] {
  if (!cph?.saltoOmAt) return etapas
  return etapas.map((e) => {
    if (ETAPAS_RESUELTAS_POR_SALTO.includes(e.id)) return { ...e, estado: 'completada' }
    if (e.id === 'designacion') return { ...e, estado: 'activa' }
    return e
  })
}

const TEXTOS_NO_HABILITADO: Record<MotivoNoHabilitadoOm, string> = {
  sin_tipo_gestion: 'Guardá el tipo de gestión para ver las órdenes de mérito disponibles',
  solo_nuevo_cargo: 'Las órdenes de mérito solo se ofrecen en concursos de cargo nuevo',
  concurso_finalizado: 'El concurso ya está finalizado',
  concurso_suspendido: 'El concurso está suspendido',
  etapa_avanzada: 'El concurso ya avanzó más allá de la Etapa 2',
  ya_resuelto: 'El concurso ya tiene una designación resuelta',
  sin_especialidad: 'El concurso no tiene especialidad definida para buscar órdenes de mérito',
}

/** Mensaje corto en español para un motivo de no habilitado. */
export function textoNoHabilitado(motivo: MotivoNoHabilitadoOm | null | undefined): string {
  if (!motivo) return 'No se pueden ofrecer órdenes de mérito para este concurso'
  return TEXTOS_NO_HABILITADO[motivo] ?? 'No se pueden ofrecer órdenes de mérito para este concurso'
}

function fechaCorta(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'
}

/** Etiqueta de una OM: "CÓDIGO · especialidad · puesto · vigente hasta dd/mm/aaaa". */
export function etiquetaOm(orden: OmDisponible): string {
  const partes = [
    orden.concursoOrigen.codigo ?? 'OM',
    orden.especialidad,
    orden.puesto,
    `vigente hasta ${fechaCorta(orden.vigenteHasta)}`,
  ].filter((p): p is string => !!p)
  return partes.join(' · ')
}

/** El panel de reutilización de OM de la Etapa 1 se reemplaza por el de Etapa 2 solo en nuevo_cargo. */
export function debeOcultarPanelEtapa1(
  concurso: { motivoConcurso?: string | null } | null | undefined,
): boolean {
  return concurso?.motivoConcurso === 'nuevo_cargo'
}
