// Guards compartidos por las escrituras de jurado e inscriptos CEETPS: mismas
// reglas que el PATCH del concurso (patchConcursoCeetpsService).
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { MENSAJE_BLOQUEO_ETAPA_2, esNuevoCargoSinAutorizar } from './autorizacionNuevoCargo.js'

type Db = Pick<typeof prisma, 'concursoCeetps'>

const SELECT_CONCURSO = {
  id: true,
  estado: true,
  juradoCantTitulares: true,
  juradoCantSuplentes: true,
  puntajeMinimoExamen: true,
  puntajeMinimoCv: true,
  puntajeMinimoEntrevista: true,
  concurso: { select: { motivoConcurso: true, autorizadoAt: true } },
} as const

/** 404 si el concurso CEETPS no existe. */
export async function cargarConcursoCeetps(id: string, db: Db = prisma) {
  const c = await db.concursoCeetps.findUnique({ where: { id }, select: SELECT_CONCURSO })
  if (!c) throw AppError.notFound('Concurso CEETPS no encontrado')
  return c
}

/**
 * Concurso CEETPS que se puede modificar: 404 si no existe, 409 si está
 * finalizado/desierto o si es un cargo nuevo todavía sin autorizar por SGRASV
 * (jurado e inscriptos son Etapa 2+).
 */
export async function cargarConcursoCeetpsEditable(id: string, db: Db = prisma) {
  const c = await cargarConcursoCeetps(id, db)
  if (c.estado === 'finalizado' || c.estado === 'desierto') {
    throw AppError.conflict(`No se puede modificar un concurso ${c.estado}`)
  }
  if (esNuevoCargoSinAutorizar(c.concurso)) throw AppError.conflict(MENSAJE_BLOQUEO_ETAPA_2)
  return c
}
