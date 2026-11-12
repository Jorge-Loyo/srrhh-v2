// Paso 5b — Reglas PURAS (sin Prisma ni IO) para decidir si un concurso de cargo
// nuevo puede saltar a designación usando una persona de una orden de mérito
// (OM) existente, y qué OM le sirven. Las usa omSalto.service.ts y se testean
// directo, sin base.
import { etapaDeSubEstado } from './concursosCph.calc.js'
import { MOTIVO_CONCURSO_NUEVO_CARGO } from '../cargos/concursoActivo.regla.js'

export type TipoGestionOm = 'centralizado' | 'descentralizado'

/** Pasos que el salto da por resueltos (van a la auditoría). No se inventan datos de ellos. */
export const PASOS_RESUELTOS_POR_OM = [
  'jurado',
  'inscripcion',
  'examen',
  'orden_merito',
] as const

export type MotivoNoOfrecerOm =
  | 'solo_nuevo_cargo'
  | 'sin_tipo_gestion'
  | 'concurso_finalizado'
  | 'concurso_suspendido'
  | 'etapa_avanzada'
  | 'ya_resuelto'
  | 'sin_especialidad'

// Mismo criterio de normalización que inscriptos.service.ts (compatibilidad de OM):
// minúscula, sin tildes, sin espacios extremos.
export function normalizarOm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export interface OmVigenciaInput {
  estado: string
  fechaVencimiento: Date
  fechaProrroga?: Date | null
}

/** Vigente: estado distinto de "vencida" y hoy <= prórroga (si hay) o vencimiento. */
export function omVigente(om: OmVigenciaInput, hoy: Date): boolean {
  if (om.estado === 'vencida') return false
  const limite = om.fechaProrroga ?? om.fechaVencimiento
  const h = new Date(hoy)
  h.setHours(0, 0, 0, 0)
  return limite >= h
}

export interface OmEspecialidadInput {
  especialidad: string | null
  puesto: string | null
}
export interface DestinoEspecialidadInput {
  especialidad: string | null
  puesto: string | null
}

/**
 * El concurso es por especialidad: debe ser igual (sin tildes ni mayúsculas).
 * El puesto se compara solo si ambos lo tienen. Destino sin especialidad => false.
 */
export function coincideEspecialidadPuesto(
  om: OmEspecialidadInput,
  destino: DestinoEspecialidadInput,
): boolean {
  const espDestino = normalizarOm(destino.especialidad)
  if (!espDestino) return false
  if (normalizarOm(om.especialidad) !== espDestino) return false
  if (om.puesto && destino.puesto && normalizarOm(om.puesto) !== normalizarOm(destino.puesto)) {
    return false
  }
  return true
}

export interface DestinoOfrecibleInput {
  motivoConcurso: string | null
  autorizadoAt: Date | null
  estado: string
  suspendido: boolean
  subEstado: string | null
  saltoOmAt: Date | null
  resolucionDesignacion: string | null
  tipoGestion: string | null
  especialidad: string | null
}

/**
 * ¿Se puede ofrecer/usar una OM en este concurso destino?
 * Nota: "nuevo_cargo sin autorizar" lo corta antes assertEtapa2Habilitada (409
 * con el mensaje de SGRASV); acá, si llegara, también devuelve ok=false.
 */
export function puedeOfrecerOm(destino: DestinoOfrecibleInput): {
  ok: boolean
  motivo: MotivoNoOfrecerOm | null
} {
  const no = (motivo: MotivoNoOfrecerOm) => ({ ok: false, motivo })
  if (destino.motivoConcurso !== MOTIVO_CONCURSO_NUEVO_CARGO || !destino.autorizadoAt) {
    return no('solo_nuevo_cargo')
  }
  if (destino.estado === 'finalizado') return no('concurso_finalizado')
  if (destino.suspendido || destino.estado === 'suspendido') return no('concurso_suspendido')
  if (destino.saltoOmAt || destino.resolucionDesignacion) return no('ya_resuelto')
  if (etapaDeSubEstado(destino.subEstado) > 2) return no('etapa_avanzada')
  if (!normalizarOm(destino.especialidad)) return no('sin_especialidad')
  if (!destino.tipoGestion) return no('sin_tipo_gestion')
  return { ok: true, motivo: null }
}

export interface ReglaGestionInput {
  tipoGestionOrigen: string | null
  tipoGestionDestino: string | null
  hospitalOrigenId: string | null
  hospitalDestinoId: string | null
}

/**
 * Regla de gestión centralizado/descentralizado entre la OM de origen y el
 * concurso destino.
 *
 * REGLA PENDIENTE de Jorge: dijo que cada OM se arma con reglas que dependen de
 * si el concurso es centralizado o descentralizado, pero no las precisó. Hasta
 * que las confirme, NO se bloquea nada: solo se advierte cuando
 *  - los tipos difieren,
 *  - el origen no tiene tipo definido,
 *  - el origen es descentralizado y el hospital difiere.
 * Pregunta abierta: ¿una OM descentralizada solo sirve en su misma repartición?
 * ¿Una centralizada sirve en cualquier repartición?
 */
export function reglaGestionOm(i: ReglaGestionInput): { permite: true; advertencias: string[] } {
  const advertencias: string[] = []
  if (!i.tipoGestionOrigen) {
    advertencias.push('El concurso de origen no tiene el tipo de gestión definido.')
  } else if (i.tipoGestionDestino && i.tipoGestionOrigen !== i.tipoGestionDestino) {
    advertencias.push(
      `El orden de mérito es de un concurso ${i.tipoGestionOrigen} y este concurso es ${i.tipoGestionDestino}.`,
    )
  }
  if (
    i.tipoGestionOrigen === 'descentralizado' &&
    i.hospitalOrigenId &&
    i.hospitalDestinoId &&
    i.hospitalOrigenId !== i.hospitalDestinoId
  ) {
    advertencias.push('El orden de mérito es descentralizado y pertenece a otra repartición.')
  }
  return { permite: true, advertencias }
}

export interface OmCandidataInput extends OmVigenciaInput, OmEspecialidadInput {
  concursoCphId: string
}

/** Mismo escalafón (carrera) entre el cargo del concurso origen y el del destino. */
export function mismoEscalafon(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a === b
}
export interface EvaluarElegibilidadInput {
  om: OmCandidataInput
  destino: DestinoEspecialidadInput & {
    concursoCphId: string
    tipoGestion: string | null
    hospitalId: string | null
    escalafonId: string | null
  }
  origen: { tipoGestion: string | null; hospitalId: string | null; escalafonId: string | null }
  hoy: Date
}
export type EvaluarElegibilidadResult =
  | { elegible: true; advertencias: string[] }
  | { elegible: false; motivo: 'propia' | 'vencida' | 'especialidad_puesto' | 'escalafon' }

/** Compone todo: no es la propia OM, vigente, misma especialidad/puesto, mismo escalafón y regla de gestión. */
export function evaluarElegibilidadOm(i: EvaluarElegibilidadInput): EvaluarElegibilidadResult {
  if (i.om.concursoCphId === i.destino.concursoCphId) return { elegible: false, motivo: 'propia' }
  if (!omVigente(i.om, i.hoy)) return { elegible: false, motivo: 'vencida' }
  if (!coincideEspecialidadPuesto(i.om, i.destino)) {
    return { elegible: false, motivo: 'especialidad_puesto' }
  }
  if (!mismoEscalafon(i.origen.escalafonId, i.destino.escalafonId)) {
    return { elegible: false, motivo: 'escalafon' }
  }
  const regla = reglaGestionOm({
    tipoGestionOrigen: i.origen.tipoGestion,
    tipoGestionDestino: i.destino.tipoGestion,
    hospitalOrigenId: i.origen.hospitalId,
    hospitalDestinoId: i.destino.hospitalId,
  })
  return { elegible: true, advertencias: regla.advertencias }
}
