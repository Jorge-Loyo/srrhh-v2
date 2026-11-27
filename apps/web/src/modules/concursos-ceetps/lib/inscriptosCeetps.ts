import type { InscriptoCeetpsDto, InscriptoConcurso } from '@srrhh/types'

// Etapa 3 del wizard CEETPS: pasos del concurso. Cada paso muestra solo a
// quienes aprobaron el anterior (los flags pasa* los calcula el backend contra
// los puntajes mínimos). El orden de mérito final lo carga el jurado a mano.

export type PasoCeetps = 'inscripcion' | 'admisibilidad' | 'examen' | 'cv' | 'entrevista' | 'orden'

export const PASOS_CEETPS: { id: PasoCeetps; label: string }[] = [
  { id: 'inscripcion', label: 'Inscripción' },
  { id: 'admisibilidad', label: 'Admisibilidad' },
  { id: 'examen', label: 'Examen' },
  { id: 'cv', label: 'Análisis curricular' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'orden', label: 'Orden de mérito final' },
]

export function inscriptosDelPaso(
  items: InscriptoCeetpsDto[],
  paso: PasoCeetps,
): InscriptoCeetpsDto[] {
  switch (paso) {
    case 'inscripcion':
    case 'admisibilidad':
      return items
    case 'examen':
      return items.filter((i) => i.pasaAdmision === true)
    case 'cv':
      return items.filter((i) => i.pasaExamen === true)
    case 'entrevista':
      return items.filter((i) => i.pasaCv === true)
    case 'orden':
      return items.filter((i) => i.finalista)
  }
}

export function faltantesEtapa3(items: InscriptoCeetpsDto[]): string[] {
  const finalistas = items.filter((i) => i.finalista)
  if (finalistas.length === 0) return ['No hay finalistas: nadie aprobó todavía todos los pasos']
  const sinPosicion = finalistas.filter((i) => i.ordenMerito == null).length
  if (sinPosicion === 0) return []
  return [`Falta el orden de mérito de ${sinPosicion} finalista${sinPosicion === 1 ? '' : 's'}`]
}

export function ordenMeritoCompleto(items: InscriptoCeetpsDto[]): boolean {
  return faltantesEtapa3(items).length === 0
}

// Forma de inscripto CPH que esperan la Etapa 4 y el modal de designación
// (heredados del wizard CPH). Solo los finalistas conservan la posición: un
// orden de mérito que quedó cargado a alguien que después dejó de aprobar un
// paso no lo vuelve candidato.
export function inscriptoComoCph(i: InscriptoCeetpsDto): InscriptoConcurso {
  return {
    id: i.id,
    concursoCphId: i.concursoCeetpsId,
    apellido: i.apellido,
    nombre: i.nombre,
    dni: i.dni,
    cuil: i.cuil,
    sexo: null,
    fechaNacimiento: null,
    nacionalidad: null,
    telefono: i.telefono,
    email: i.email,
    titulo: null,
    matricula: null,
    especialidad: null,
    presentoExamen: i.presentoExamen,
    nota: i.notaExamen,
    ordenMerito: i.finalista ? i.ordenMerito : null,
    observaciones: i.observaciones,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }
}
