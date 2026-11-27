// =============================================================================
// Inscriptos de concursos CEETPS (Etapa 3 — pasos del concurso)
// =============================================================================
// Alta manual o por Excel, edición de cualquier paso en cualquier momento del
// concurso. Quién aprobó cada paso y la posición en el orden de mérito final se
// calculan al leer (inscriptos.calc.ts) contra los mínimos del concurso.

import type { InscriptoCeetps, Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { cargarConcursoCeetps, cargarConcursoCeetpsEditable } from './concursoEditable.js'
import { calcularPosiciones, evaluarPasos, type MinimosPasos } from './inscriptos.calc.js'
import { interpretarFila } from './inscriptos.importar.js'
import type {
  ImportarInscriptosBody,
  InscriptoCeetpsBody,
  InscriptoCeetpsPatchBody,
} from './inscriptos.schema.js'

type ConcursoConMinimos = {
  puntajeMinimoExamen: number | null
  puntajeMinimoCv: number | null
  puntajeMinimoEntrevista: number | null
}

function minimosDe(c: ConcursoConMinimos): MinimosPasos {
  return {
    examen: c.puntajeMinimoExamen,
    cv: c.puntajeMinimoCv,
    entrevista: c.puntajeMinimoEntrevista,
  }
}

// Agrega a cada inscripto quién aprobó cada paso y, para los finalistas, su
// posición en el orden de mérito (la columna ordenMerito de la base ya no se usa).
function conPasos(inscriptos: InscriptoCeetps[], minimos: MinimosPasos) {
  const evaluados = inscriptos.map((i) => ({ ...i, ...evaluarPasos(i, minimos) }))
  const posiciones = calcularPosiciones(evaluados)
  return evaluados.map((i) => ({
    ...i,
    ordenMerito: posiciones.get(i.id)?.posicion ?? null,
    empate: posiciones.get(i.id)?.empate ?? false,
  }))
}

async function listarConPasos(concursoId: string, minimos: MinimosPasos) {
  const inscriptos = await prisma.inscriptoCeetps.findMany({
    where: { concursoCeetpsId: concursoId },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
  })
  return conPasos(inscriptos, minimos)
}

async function buscarInscripto(concursoId: string, inscriptoId: string) {
  const inscripto = await prisma.inscriptoCeetps.findFirst({
    where: { id: inscriptoId, concursoCeetpsId: concursoId },
  })
  if (!inscripto) throw AppError.notFound('Inscripto no encontrado')
  return inscripto
}

export async function listInscriptosCeetpsService(concursoId: string) {
  const c = await cargarConcursoCeetps(concursoId)
  return listarConPasos(concursoId, minimosDe(c))
}

export async function createInscriptoCeetpsService(concursoId: string, body: InscriptoCeetpsBody) {
  const c = await cargarConcursoCeetpsEditable(concursoId)
  // apps/api tiene strict:false: Zod tipa apellido/nombre como opcionales aunque
  // el schema los exige; el cast refleja lo que ya validó el parse.
  const data = {
    concursoCeetpsId: concursoId,
    ...body,
  } as Prisma.InscriptoCeetpsUncheckedCreateInput
  const creado = await prisma.inscriptoCeetps.create({ data })
  const lista = await listarConPasos(concursoId, minimosDe(c))
  return lista.find((i) => i.id === creado.id)!
}

export async function updateInscriptoCeetpsService(
  concursoId: string,
  inscriptoId: string,
  body: InscriptoCeetpsPatchBody,
) {
  const c = await cargarConcursoCeetpsEditable(concursoId)
  const existente = await buscarInscripto(concursoId, inscriptoId)
  const minimos = minimosDe(c)

  // Reclamo de la nota de examen: solo puede iniciarlo quien NO aprobó. Si ya
  // había un reclamo, se conserva aunque la nota corregida ahora apruebe.
  if (body.reclamoExamen === true && !existente.reclamoExamen) {
    const resultante = { ...existente, ...body } as InscriptoCeetps
    if (evaluarPasos(resultante, minimos).pasaExamen !== false) {
      throw AppError.conflict('Solo puede reclamar la nota quien no alcanzó el puntaje mínimo del examen.')
    }
  }

  await prisma.inscriptoCeetps.update({ where: { id: inscriptoId }, data: body })
  const lista = await listarConPasos(concursoId, minimos)
  return lista.find((i) => i.id === inscriptoId)!
}

export async function deleteInscriptoCeetpsService(concursoId: string, inscriptoId: string) {
  await cargarConcursoCeetpsEditable(concursoId)
  await buscarInscripto(concursoId, inscriptoId)
  await prisma.inscriptoCeetps.delete({ where: { id: inscriptoId } })
}

/** "Todos entregaron documentación": marca (o desmarca) a todos los inscriptos del concurso. */
export async function marcarDocumentacionCeetpsService(concursoId: string, entregoDocumentacion: boolean) {
  await cargarConcursoCeetpsEditable(concursoId)
  const r = await prisma.inscriptoCeetps.updateMany({
    where: { concursoCeetpsId: concursoId },
    data: { entregoDocumentacion },
  })
  return { actualizados: r.count }
}

export interface ResultadoImportacion {
  creados: number
  actualizados: number
  errores: { fila: number; motivo: string }[]
}

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/**
 * Importa un paso desde las filas de un Excel. Cada fila se cruza con los
 * inscriptos del concurso por DNI o CUIL. Solo la Inscripción crea inscriptos
 * nuevos; el resto de los pasos completan a los ya inscriptos. Las filas con
 * error no se aplican y se informan (número de fila del Excel, con encabezado en
 * la 1); las demás sí.
 */
export async function importarInscriptosCeetpsService(
  concursoId: string,
  body: ImportarInscriptosBody,
): Promise<ResultadoImportacion> {
  await cargarConcursoCeetpsEditable(concursoId)
  const existentes = await prisma.inscriptoCeetps.findMany({ where: { concursoCeetpsId: concursoId } })
  const porDni = new Map<string, InscriptoCeetps>()
  const porCuil = new Map<string, InscriptoCeetps>()
  const indexar = (i: InscriptoCeetps) => {
    if (digitos(i.dni)) porDni.set(digitos(i.dni), i)
    if (digitos(i.cuil)) porCuil.set(digitos(i.cuil), i)
  }
  existentes.forEach(indexar)

  const resultado: ResultadoImportacion = { creados: 0, actualizados: 0, errores: [] }
  const vistos = new Set<string>()

  await prisma.$transaction(async (tx) => {
    for (const [idx, fila] of body.filas.entries()) {
      const numero = idx + 2
      const interpretada = interpretarFila(body.paso, fila)
      if (interpretada.ok === false) {
        resultado.errores.push({ fila: numero, motivo: interpretada.motivo })
        continue
      }
      const { dni, cuil, cambios } = interpretada.datos
      const clave = dni ?? cuil!
      if (vistos.has(clave)) {
        resultado.errores.push({ fila: numero, motivo: `DNI/CUIL repetido en el archivo (${clave}).` })
        continue
      }
      vistos.add(clave)

      const existente = (dni ? porDni.get(dni) : undefined) ?? (cuil ? porCuil.get(cuil) : undefined)
      if (existente) {
        const actualizado = await tx.inscriptoCeetps.update({
          where: { id: existente.id },
          data: cambios as Prisma.InscriptoCeetpsUpdateInput,
        })
        indexar(actualizado)
        resultado.actualizados++
        continue
      }
      if (body.paso !== 'inscripcion') {
        resultado.errores.push({ fila: numero, motivo: `No hay un inscripto con DNI/CUIL ${clave} en este concurso.` })
        continue
      }
      if (!cambios.apellido || !cambios.nombre) {
        resultado.errores.push({ fila: numero, motivo: 'Para inscribir a una persona nueva faltan Apellido y Nombre.' })
        continue
      }
      const creado = await tx.inscriptoCeetps.create({
        data: { concursoCeetpsId: concursoId, ...cambios } as Prisma.InscriptoCeetpsUncheckedCreateInput,
      })
      indexar(creado)
      resultado.creados++
    }
  })
  return resultado
}
