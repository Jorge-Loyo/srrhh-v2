// Paso 2b — Autorización obligatoria en CEETPS para concursos de CARGO NUEVO.
// Lógica pura (sin Prisma). Aplica SOLO a Concurso.motivoConcurso = 'nuevo_cargo'
// sin autorizar; el resto de los concursos CEETPS no cambia.
import { AppError } from '../../shared/errors/AppError.js'
import {
  MENSAJE_BLOQUEO_ETAPA_2,
  esNuevoCargoSinAutorizar,
  type ConcursoBaseAutorizable,
} from '../concursos-cph/autorizacionNuevoCargo.js'
import type { AutorizacionNuevoCargoCeetpsCalc } from './concursosCeetps.calc.js'
import type { PatchConcursoCeetpsBody } from './concursos-ceetps.schema.js'

export { MENSAJE_BLOQUEO_ETAPA_2, esNuevoCargoSinAutorizar }

/** Campos del PATCH que pertenecen a la Etapa 2 en adelante (disposición, IFACS/INSAL, designación). */
export const CAMPOS_ETAPA_2_EN_ADELANTE_CEETPS = [
  'fechaAutorizacion',
  'dispoLlamado',
  'fechaIfacs',
  'fechaInsal',
  'expedienteDesignacion',
  'dispoDesignacion',
  'resolucionDesignacion',
  'puestoDesignado',
  'estadoApto',
  'numeroAptoMedico',
  'fechaProyectoDispo',
  'altaSial',
  'codigoSial',
] as const satisfies readonly (keyof PatchConcursoCeetpsBody)[]

function normalizar(v: unknown): unknown {
  if (v === undefined || v === null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') return v.trim()
  return v
}

/** boolean null ≡ false (altaSial es nullable, el front manda false por defecto). */
function normalizarCampo(key: string, v: unknown): unknown {
  const n = normalizar(v)
  if (key === 'altaSial' && n === false) return null
  return n
}

/**
 * Campos de Etapa 2+ que el body CAMBIA respecto del valor existente. El
 * formulario CEETPS reenvía todos los campos en cada guardado, por eso solo
 * cuenta un valor distinto del actual ('' ≡ null, fechas a YYYY-MM-DD).
 */
export function camposEtapa2Modificados(
  body: PatchConcursoCeetpsBody,
  existing: Record<string, unknown>,
): string[] {
  return CAMPOS_ETAPA_2_EN_ADELANTE_CEETPS.filter((k) => {
    if (body[k] === undefined) return false
    return normalizarCampo(k, body[k]) !== normalizarCampo(k, existing[k])
  })
}

/** 409 si el concurso es nuevo_cargo sin autorizar y el body cambia campos de Etapa 2+. */
export function validarBloqueoEtapa2Ceetps(
  concurso: ConcursoBaseAutorizable | null | undefined,
  body: PatchConcursoCeetpsBody,
  existing: Record<string, unknown>,
): void {
  if (!esNuevoCargoSinAutorizar(concurso)) return
  if (camposEtapa2Modificados(body, existing).length === 0) return
  throw AppError.conflict(MENSAJE_BLOQUEO_ETAPA_2)
}

/** Valores resueltos (body sobre existente) del expediente y el IF. */
export function resolverEtapa1Ceetps(
  body: PatchConcursoCeetpsBody,
  existing: { expedienteConcurso?: string | null; ifAutorizacion?: string | null },
) {
  const expediente = body.expedienteConcurso !== undefined ? body.expedienteConcurso : existing.expedienteConcurso
  const ifAut = body.ifAutorizacion !== undefined ? body.ifAutorizacion : existing.ifAutorizacion
  return {
    expedienteConcurso: (normalizar(expediente) as string | null),
    ifAutorizacion: (normalizar(ifAut) as string | null),
    tocaEtapa1: body.expedienteConcurso !== undefined || body.ifAutorizacion !== undefined,
  }
}

/** 400 si un nuevo_cargo sin autorizar toca la Etapa 1 y queda un expediente sin IF. */
export function validarIfCeetps(
  concurso: ConcursoBaseAutorizable | null | undefined,
  body: PatchConcursoCeetpsBody,
  existing: { expedienteConcurso?: string | null; ifAutorizacion?: string | null },
): void {
  if (!esNuevoCargoSinAutorizar(concurso)) return
  const e1 = resolverEtapa1Ceetps(body, existing)
  if (!e1.tocaEtapa1) return
  if (e1.expedienteConcurso && !e1.ifAutorizacion) {
    throw AppError.badRequest(
      'Para un concurso de cargo nuevo, el IF de autorización es obligatorio junto con el expediente de concurso',
    )
  }
}

/**
 * ¿Hay que solicitar (o auto-aprobar) la autorización de apertura? Para
 * nuevo_cargo sin autorizar: el guardado toca la Etapa 1, queda completa
 * (expediente + IF) y no hay otra autorización pendiente.
 */
export function debeSolicitarAperturaCeetps(i: {
  concurso: ConcursoBaseAutorizable | null | undefined
  body: PatchConcursoCeetpsBody
  existing: { expedienteConcurso?: string | null; ifAutorizacion?: string | null }
  pendienteAutorizacion: boolean
}): boolean {
  if (!esNuevoCargoSinAutorizar(i.concurso)) return false
  const e1 = resolverEtapa1Ceetps(i.body, i.existing)
  return e1.tocaEtapa1 && !i.pendienteAutorizacion && !!e1.expedienteConcurso && !!e1.ifAutorizacion
}

/** Estado de autorización para calcEstadoCeetps; `undefined` si no es nuevo_cargo. */
export function autorizacionParaCalcCeetps(
  concurso: ConcursoBaseAutorizable | null | undefined,
  opts: { pendiente: boolean; autoAprobar: boolean },
): AutorizacionNuevoCargoCeetpsCalc | undefined {
  if (!concurso || concurso.motivoConcurso !== 'nuevo_cargo') return undefined
  if (concurso.autorizadoAt != null || opts.autoAprobar) return 'autorizado'
  return opts.pendiente ? 'pendiente' : 'sin_solicitar'
}
