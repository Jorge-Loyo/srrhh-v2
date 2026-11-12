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

/** Códigos de registro elegibles al pasar a CEETPS (Ajuste 5a). */
export const CR_OPCIONES_CEETPS = [
  { codigo: '85', label: '85 — CEETPS (Técnicos)' },
  { codigo: '87', label: '87 — Nueva Carrera Enfermería' },
] as const

/** El selector de código de registro solo aparece al pasar a CEETPS. */
export function requiereCodigoRegistro(destino: TipoConcursoUi): boolean {
  return destino === 'ceetps'
}

function normalizar(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** 87 si algún puesto del cargo es de enfermería (contiene 'enfermer'); 85 en otro caso. */
export function codigoRegistroPreseleccionado(...puestos: (string | null | undefined)[]): '85' | '87' {
  return puestos.some((p) => normalizar(p).includes('enfermer')) ? '87' : '85'
}

/** Etapa 1 completa (expediente + IF): condición para que la corrección autorice. */
export function etapa1CompletaParaAutorizar(
  c: { eeConcurso?: string | null; expedienteConcurso?: string | null; ifAutorizacion?: string | null } | null | undefined,
): boolean {
  return !!c && !!(c.eeConcurso || c.expedienteConcurso) && !!c.ifAutorizacion
}

export function textoConfirmacionCambio(actual: TipoConcursoUi, autoriza = true): string {
  const destino = tipoDestinoDe(actual)
  const base = `Este concurso pasará de ${LABEL_TIPO_CONCURSO[actual]} a ${LABEL_TIPO_CONCURSO[destino]}`
  return autoriza
    ? `${base} y quedará AUTORIZADO en este acto.`
    : `${base} y quedará sin autorizar hasta cargar expediente e IF.`
}

export function avisoCorreccionExitosa(destino: TipoConcursoUi, autorizado = false): string {
  return autorizado
    ? `El concurso ahora es ${LABEL_TIPO_CONCURSO[destino]} y quedó AUTORIZADO.`
    : `El concurso ahora es ${LABEL_TIPO_CONCURSO[destino]} y quedó sin autorizar: falta expediente/IF. Completá la Etapa 1 para autorizarlo.`
}
