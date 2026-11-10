// Paso 3 (2b-b) — Bloqueo 409 de los endpoints de Etapa 2+ de CPH (jurado,
// inscriptos/examen/OM, designación, desierto) cuando el concurso es de cargo
// nuevo y SGRASV todavía no lo autorizó. Mismo helper/mensaje que el PATCH
// (autorizacionNuevoCargo.ts). Los concursos que no son nuevo_cargo no se tocan.
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { esNuevoCargoSinAutorizar, MENSAJE_BLOQUEO_ETAPA_2 } from './autorizacionNuevoCargo.js'

/**
 * Lanza 409 si el ConcursoCph es nuevo_cargo sin autorizar. Si el concurso no
 * existe no hace nada: el 404 lo sigue dando el servicio que lo invoca.
 */
export async function assertEtapa2Habilitada(concursoCphId: string): Promise<void> {
  const c = await prisma.concursoCph.findUnique({
    where: { id: concursoCphId },
    select: { concurso: { select: { motivoConcurso: true, autorizadoAt: true } } },
  })
  if (c && esNuevoCargoSinAutorizar(c.concurso)) throw AppError.conflict(MENSAJE_BLOQUEO_ETAPA_2)
}
