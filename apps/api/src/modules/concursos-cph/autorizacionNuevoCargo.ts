// Paso 2a — Autorización obligatoria en CPH para concursos de CARGO NUEVO.
// Lógica pura (sin Prisma) para poder testearla directo. Todo aplica SOLO a los
// concursos con Concurso.motivoConcurso = 'nuevo_cargo'; los demás (incluido
// motivo NULL) se comportan exactamente como siempre.
import { AppError } from '../../shared/errors/AppError.js'
import { MOTIVO_CONCURSO_NUEVO_CARGO } from '../cargos/concursoActivo.regla.js'
import type { PatchConcursoCphBody } from './concursos-cph.schema.js'
import type { AutorizacionNuevoCargoCalc } from './concursosCph.calc.js'

export interface ConcursoBaseAutorizable {
  motivoConcurso?: string | null
  autorizadoAt?: Date | null
}

/** Campos del PATCH que pertenecen a las Etapas 2 a 5 del wizard. */
export const CAMPOS_ETAPA_2_EN_ADELANTE = [
  // Etapa 2 — Jurado / Dispo
  'fechaAutorizacion',
  'sorteoJurado',
  'tipoGestion',
  'disposicion',
  // Etapa 3 — Inscripción / Examen / Orden de mérito
  'fechaInscDesde',
  'fechaInscHasta',
  'fechaExamen',
  'fechaOrdenMerito',
  'qInscriptos',
  // Etapa 4 — IFACS / INSAL
  'ifacs',
  'fechaIfacs',
  'insal',
  'fechaInsal',
  'insalAceptado',
  'insalRechazados',
  'inscriptoReservadoId',
  // Etapa 5 — Designación
  'eeDesignacion',
  'cargaDocumentacion',
  'fechaAptoMedico',
  'fechaIte',
  'proyectoResolucion',
  'resoALaFirma',
  'resolucionDesignacion',
  'fechaResolucion',
  'cargoSial',
  'personaDesignadaId',
  // Desierto (cierre del concurso en etapas posteriores)
  'dispoDesierta',
  'fechaDispoDesierta',
] as const satisfies readonly (keyof PatchConcursoCphBody)[]

/**
 * Estado de autorización que se le pasa a calcConcursoCph. `undefined` si el
 * concurso no es nuevo_cargo (comportamiento idéntico al de siempre).
 */
export function autorizacionParaCalc(
  concurso: ConcursoBaseAutorizable | null | undefined,
  opts: { pendiente: boolean; autoAprobar: boolean },
): AutorizacionNuevoCargoCalc | undefined {
  if (!concurso || concurso.motivoConcurso !== MOTIVO_CONCURSO_NUEVO_CARGO) return undefined
  if (concurso.autorizadoAt != null || opts.autoAprobar) return 'autorizado'
  return opts.pendiente ? 'pendiente' : 'sin_solicitar'
}

export const MENSAJE_BLOQUEO_ETAPA_2 =
  'El concurso necesita la autorización de SGRASV para avanzar a la Etapa 2'

/** ¿Es un concurso de cargo nuevo que todavía no fue autorizado por SGRASV? */
export function esNuevoCargoSinAutorizar(c: ConcursoBaseAutorizable | null | undefined): boolean {
  return !!c && c.motivoConcurso === MOTIVO_CONCURSO_NUEVO_CARGO && c.autorizadoAt == null
}

/** Campos de Etapa 2+ que el body intenta modificar (valor distinto de undefined). */
export function camposEtapa2EnBody(body: PatchConcursoCphBody): string[] {
  return CAMPOS_ETAPA_2_EN_ADELANTE.filter((k) => body[k] !== undefined)
}

/** 409 si el concurso es nuevo_cargo sin autorizar y el body toca campos de Etapa 2+. */
export function validarBloqueoEtapa2(
  concurso: ConcursoBaseAutorizable | null | undefined,
  body: PatchConcursoCphBody,
): void {
  if (!esNuevoCargoSinAutorizar(concurso)) return
  if (camposEtapa2EnBody(body).length === 0) return
  throw AppError.conflict(MENSAJE_BLOQUEO_ETAPA_2)
}

export interface DecisionAperturaInput {
  concurso: ConcursoBaseAutorizable | null | undefined
  /** Valores resueltos (body sobre existente) de la Etapa 1. */
  eeConcurso: string | null | undefined
  ifAutorizacion: string | null | undefined
  /** El body toca eeConcurso o ifAutorizacion (descarta guardados ajenos a la Etapa 1). */
  tocaEtapa1: boolean
  pendienteAutorizacion: boolean
  requiereAutorizacionDoble: boolean
  tieneCambioProtegido: boolean
}

/**
 * Concurso nuevo_cargo: exige el IF junto con el expediente. Lanza 400 si el
 * guardado toca la Etapa 1 y queda un expediente sin IF.
 */
export function validarIfAutorizacionNuevoCargo(i: Pick<DecisionAperturaInput, 'concurso' | 'eeConcurso' | 'ifAutorizacion' | 'tocaEtapa1'>): void {
  if (!esNuevoCargoSinAutorizar(i.concurso)) return
  if (!i.tocaEtapa1) return
  if (i.eeConcurso && !i.ifAutorizacion) {
    throw AppError.badRequest(
      'Para un concurso de cargo nuevo, el IF de autorización es obligatorio junto con el expediente de concurso',
    )
  }
}

/**
 * ¿Hay que solicitar la autorización de apertura a SGRASV? Para nuevo_cargo se
 * pide cada vez que la Etapa 1 queda completa (expediente + IF), no hay una
 * autorización pendiente y el concurso no está autorizado todavía.
 */
export function debeSolicitarAperturaNuevoCargo(i: DecisionAperturaInput): boolean {
  return (
    esNuevoCargoSinAutorizar(i.concurso) &&
    i.tocaEtapa1 &&
    !i.requiereAutorizacionDoble &&
    !i.tieneCambioProtegido &&
    !i.pendienteAutorizacion &&
    !!i.eeConcurso &&
    !!i.ifAutorizacion
  )
}
