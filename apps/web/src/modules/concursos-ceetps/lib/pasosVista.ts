import type { InscriptoCeetpsDto } from '@srrhh/types'
import { inscriptosDelPaso, type PasoCeetps } from './inscriptosCeetps'

// Utilidades de vista de la Etapa 3 (Pasos del concurso): en qué paso está el
// concurso, qué hitos del cronograma le corresponden, orden de las columnas del
// orden de mérito, buscador y paginación de las tablas.

/**
 * El primer paso que todavía no está completo, para resaltarlo en "Pasos del
 * concurso" y en el cronograma. Sin inscriptos, el concurso está en Inscripción.
 */
export function pasoActual(items: InscriptoCeetpsDto[]): PasoCeetps {
  if (items.length === 0) return 'inscripcion'
  if (items.some((i) => i.pasaAdmision == null)) return 'admisibilidad'
  const admitidos = inscriptosDelPaso(items, 'examen')
  if (admitidos.length === 0 || admitidos.some((i) => i.pasaExamen == null)) return 'examen'
  const conExamen = inscriptosDelPaso(items, 'cv')
  if (conExamen.length === 0 || conExamen.some((i) => i.pasaCv == null)) return 'cv'
  const conCv = inscriptosDelPaso(items, 'entrevista')
  if (conCv.length === 0 || conCv.some((i) => i.pasaEntrevista == null)) return 'entrevista'
  return 'orden'
}

/** Hitos del cronograma que corresponden a cada paso (para resaltarlos). */
export const CRONOGRAMA_POR_PASO: Record<PasoCeetps, readonly string[]> = {
  inscripcion: ['publicacion_normativa', 'inscripcion_desde', 'inscripcion_hasta'],
  admisibilidad: [
    'analisis_admisibilidad',
    'comunicacion_admitidos',
    'reclamos_admisibilidad',
    'respuesta_jurado_admisibilidad',
  ],
  examen: [
    'examen',
    'comunicacion_resultado_examen',
    'reclamos_nota_examen',
    'respuesta_jurado_examen',
  ],
  cv: ['analisis_curricular', 'comunicacion_resultado_cv', 'comunicacion_resultado_reclamos'],
  entrevista: ['entrevistas_desde', 'entrevistas_hasta'],
  orden: ['comunicacion_orden_merito', 'adjudicacion_cargos'],
}

export type ColumnaOrden = 'posicion' | 'entrevista' | 'examen' | 'cv'

/** Ordena a los finalistas por la columna elegida (sin tocar su posición). */
export function ordenarFinalistas(
  items: InscriptoCeetpsDto[],
  columna: ColumnaOrden,
  descendente: boolean,
): InscriptoCeetpsDto[] {
  const valor = (i: InscriptoCeetpsDto): number => {
    const v =
      columna === 'posicion'
        ? i.ordenMerito
        : columna === 'entrevista'
          ? i.puntajeEntrevista
          : columna === 'examen'
            ? i.notaExamen
            : i.puntajeCv
    return v ?? (descendente ? -Infinity : Infinity)
  }
  const signo = descendente ? -1 : 1
  return [...items].sort(
    (a, b) =>
      signo * (valor(a) - valor(b)) ||
      (a.ordenMerito ?? Infinity) - (b.ordenMerito ?? Infinity) ||
      `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'),
  )
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Buscador de las tablas: apellido, nombre, DNI, CUIL o email (sin acentos ni mayúsculas). */
export function filtrarInscriptos(
  items: InscriptoCeetpsDto[],
  texto: string,
): InscriptoCeetpsDto[] {
  const q = sinAcentos(texto.trim())
  if (!q) return items
  return items.filter((i) =>
    sinAcentos(
      `${i.apellido} ${i.nombre} ${i.dni ?? ''} ${i.cuil ?? ''} ${i.email ?? ''}`,
    ).includes(q),
  )
}

export function paginar<T>(items: T[], pagina: number, porPagina: number) {
  const paginas = Math.max(1, Math.ceil(items.length / porPagina))
  const actual = Math.min(Math.max(1, pagina), paginas)
  return {
    pagina: actual,
    paginas,
    total: items.length,
    items: items.slice((actual - 1) * porPagina, actual * porPagina),
  }
}
