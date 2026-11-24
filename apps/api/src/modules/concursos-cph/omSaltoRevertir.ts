// Paso 5b — Reverso del salto por orden de mérito. Vive en un archivo aparte
// (sin depender de inscriptos.service.ts) para que liberar/rechazar de
// inscriptos.service.ts puedan llamarlo sin import circular con omSalto.service.ts.
import type { Prisma } from '@prisma/client'
import { calcConcursoCph } from './concursosCph.calc.js'
import { toCalcInput } from './recalcularCph.js'
import { autorizacionParaCalc } from './autorizacionNuevoCargo.js'
import { recalcularSubEstadoCargo } from '../cargos/subEstado.repo.js'

export const AUDIT_ENTIDAD_SALTO_OM = 'concurso_cph_om'
export const AUDIT_ACCION_SALTO_OM = 'designar_desde_om'
export const AUDIT_ACCION_REVERTIR_SALTO_OM = 'revertir_salto_om'

/**
 * Si el destino saltó a designación usando ESTE integrante, deshace el salto:
 * saltoOmAt / saltoOmIntegranteId a null, limpia la persona designada que puso
 * el salto, recalcula estado/sub-estados y audita. Si el destino no tiene salto
 * con ese integrante (o no existe) no hace nada y devuelve false.
 * Se llama dentro de la tx del caller (liberar / rechazar).
 */
export async function revertirSaltoOm(
  tx: Prisma.TransactionClient,
  destinoId: string | null | undefined,
  integranteId: string,
  usuarioId: string | null,
): Promise<boolean> {
  if (!destinoId) return false
  const destino = await tx.concursoCph.findUnique({
    where: { id: destinoId },
    include: { concurso: { select: { motivoConcurso: true, autorizadoAt: true } } },
  })
  if (!destino || destino.saltoOmIntegranteId !== integranteId) return false
  const integrante = await tx.ordenMeritoIntegrante.findUnique({
    where: { id: integranteId },
    select: { personaId: true, cuil: true },
  })
  const limpiaPersona =
    !!integrante?.personaId && destino.personaDesignadaId === integrante.personaId
  const limpiaRef = !!integrante && destino.designadoRefCuil === integrante.cuil
  const proximo = {
    ...destino,
    saltoOmAt: null,
    saltoOmIntegranteId: null,
    personaDesignadaId: limpiaPersona ? null : destino.personaDesignadaId,
    designadoRefCuil: limpiaRef ? null : destino.designadoRefCuil,
    designadoRefNombre: limpiaRef ? null : destino.designadoRefNombre,
  }
  const calc = calcConcursoCph({
    ...toCalcInput(proximo),
    autorizacionNuevoCargo: autorizacionParaCalc(destino.concurso, {
      pendiente: false,
      autoAprobar: false,
    }),
  })
  await tx.concursoCph.update({
    where: { id: destinoId },
    data: {
      saltoOmAt: null,
      saltoOmIntegranteId: null,
      ...(limpiaPersona && { personaDesignadaId: null }),
      ...(limpiaRef && { designadoRefCuil: null, designadoRefNombre: null }),
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
  })
  await recalcularSubEstadoCargo(tx, destino.cargoId)
  // Auditoría (no-op: audit_logs dropeada)
  await tx.$queryRaw`SELECT 1`
  return true
}
