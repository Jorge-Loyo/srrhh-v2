// ─── Paso 5a: corrección del tipo de concurso (CPH <-> CEETPS) ────────────────
// Solo quien tiene el derecho de autorizar (permiso autorizaciones/resolver_sgrasv;
// admin lo trae en su lista de permisos) y solo mientras el concurso es un cargo
// nuevo sin autorizar. El backend repite ambas validaciones (403 / 409).
import type { Usuario } from '@srrhh/types'
import { can } from '../../../shared/lib/can'
import { esNuevoCargoSinAutorizar } from './bloqueoAutorizacion'

export type TipoConcursoUi = 'cph' | 'ceetps'

export const LABEL_TIPO_CONCURSO: Record<TipoConcursoUi, string> = { cph: 'CPH', ceetps: 'CEETPS' }

interface ConcursoCorregible {
  estado?: string | null
  concurso?: { motivoConcurso?: string | null; autorizadoAt?: string | Date | null } | null
}

const ESTADOS_TERMINALES = ['finalizado', 'desierto']

export function puedeCorregirTipo(
  user: Usuario | null | undefined,
  c: ConcursoCorregible | null | undefined,
): boolean {
  if (!c || !can(user, 'autorizaciones', 'resolver_sgrasv')) return false
  if (!esNuevoCargoSinAutorizar(c.concurso)) return false
  return !ESTADOS_TERMINALES.includes(c.estado ?? '')
}

export function tipoDestinoDe(actual: TipoConcursoUi): TipoConcursoUi {
  return actual === 'cph' ? 'ceetps' : 'cph'
}

/** Ruta del front del concurso (el id de la ruta es el de ConcursoCph / ConcursoCeetps). */
export function rutaConcurso(tipo: TipoConcursoUi, detalleId: string): string {
  return tipo === 'cph' ? `/concursos/cph/${detalleId}/wizard` : `/concursos/ceetps/${detalleId}`
}

export function textoConfirmacionCambio(actual: TipoConcursoUi): string {
  const destino = tipoDestinoDe(actual)
  return `Este concurso pasará de ${LABEL_TIPO_CONCURSO[actual]} a ${LABEL_TIPO_CONCURSO[destino]}.`
}

export function avisoCorreccionExitosa(destino: TipoConcursoUi): string {
  return `El concurso ahora es ${LABEL_TIPO_CONCURSO[destino]}. Revisá la Etapa 1 antes de autorizar.`
}
