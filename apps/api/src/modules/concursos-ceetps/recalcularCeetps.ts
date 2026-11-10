// Paso 2b — recálculo de estado/sub-estado de un ConcursoCeetps con el estado de
// autorización indicado. Vive aparte del service para que autorizaciones.service.ts
// lo importe sin crear un ciclo de imports (análogo a concursos-cph/recalcularCph.ts).
import type { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError.js'
import { calcEstadoCeetps, type AutorizacionNuevoCargoCeetpsCalc } from './concursosCeetps.calc.js'

export async function recalcularCalcCeetps(
  tx: Prisma.TransactionClient,
  ceetpsId: string,
  autorizacion: AutorizacionNuevoCargoCeetpsCalc | undefined,
) {
  const row = await tx.concursoCeetps.findUnique({ where: { id: ceetpsId } })
  if (!row) throw AppError.notFound('Concurso CEETPS no encontrado')
  const calc = calcEstadoCeetps({ ...row, autorizacionNuevoCargo: autorizacion })
  await tx.concursoCeetps.update({
    where: { id: ceetpsId },
    data: { estado: calc.estado, subEstado: calc.subEstado },
  })
  return calc
}
