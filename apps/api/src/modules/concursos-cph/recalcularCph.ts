// Paso 2b — recálculo de estado/sub-estado de un ConcursoCph. Vive aparte de
// concursos-cph.service.ts para que autorizaciones.service.ts lo pueda importar
// sin crear un ciclo de imports.
import type { Prisma, ConcursoCph } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError.js'
import {
  calcConcursoCph,
  type AutorizacionNuevoCargoCalc,
  type ConcursoCphCalcInput,
} from './concursosCph.calc.js'

// Extrae los campos que usa calcConcursoCph() de una fila completa —
// reutilizado por patch/suspender (ambos parten de la fila existente y
// pisan solo lo que cambió) para no repetir la lista de campos dos veces.
export function toCalcInput(row: ConcursoCph): ConcursoCphCalcInput {
  return {
    suspendido: row.suspendido,
    eeBaja: row.eeBaja,
    fechaBaja: row.fechaBaja,
    eeConcurso: row.eeConcurso,
    fechaEeConcurso: row.fechaEeConcurso,
    fechaAutorizacion: row.fechaAutorizacion,
    sorteoJurado: row.sorteoJurado,
    disposicion: row.disposicion,
    fechaInscDesde: row.fechaInscDesde,
    fechaInscHasta: row.fechaInscHasta,
    inscripcionCerrada: row.inscripcionCerrada,
    ordenMeritoConfirmado: row.ordenMeritoConfirmado,
    fechaExamen: row.fechaExamen,
    fechaOrdenMerito: row.fechaOrdenMerito,
    fechaIfacs: row.fechaIfacs,
    fechaInsal: row.fechaInsal,
    eeDesignacion: row.eeDesignacion,
    cargaDocumentacion: row.cargaDocumentacion,
    fechaAptoMedico: row.fechaAptoMedico,
    fechaIte: row.fechaIte,
    proyectoResolucion: row.proyectoResolucion,
    resoALaFirma: row.resoALaFirma,
    resolucionDesignacion: row.resolucionDesignacion,
    fechaResolucion: row.fechaResolucion,
    cargoSial: row.cargoSial,
    dispoDesierta: row.dispoDesierta,
    fechaDispoDesierta: row.fechaDispoDesierta,
    validado: row.validado,
    validadoIdSialRol: row.validadoIdSialRol,
    saltoPorOm: row.saltoOmAt != null,
  }
}

// Relee el ConcursoCph y persiste estado/subEstado/subEstado3 con el estado de
// autorización indicado (nuevo_cargo). Usa el client transaccional del caller.
export async function recalcularCalcCph(
  tx: Prisma.TransactionClient,
  cphId: string,
  autorizacion: AutorizacionNuevoCargoCalc | undefined,
) {
  const row = await tx.concursoCph.findUnique({ where: { id: cphId } })
  if (!row) throw AppError.notFound('ConcursoCph no encontrado')
  const calc = calcConcursoCph({ ...toCalcInput(row), autorizacionNuevoCargo: autorizacion })
  await tx.concursoCph.update({
    where: { id: cphId },
    data: { estado: calc.estado, subEstado: calc.subEstado, subEstado3: calc.subEstado3 },
  })
  return calc
}
