import type { PrismaClient } from '@prisma/client'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export interface ReconciliarParams {
  codigoRepa: string | null | undefined
  codigoJefaturas: string | null | undefined
  idSial: string | null | undefined
  escalafonId: string
  literalPuesto: string | null | undefined
  especialidadLegacy: string | null | undefined
  codigoRegistroId: string | null | undefined
  // Si el código de registro no se pudo derivar automáticamente, el call-site
  // pasa la señal de revisión. Cuando llega, el cargo cubierto queda marcado
  // para revisión por ESTA causa (CR no derivable) en vez de limpiarse; si no
  // llega, se limpia la revisión (comportamiento histórico al cubrir vacante).
  revisionCr?: { motivo: string } | null
  // Régimen derivado (FEAT-003). Se persiste en regimen_id; si no fue
  // derivable, revisionRegimen trae el motivo y suma a la marca de revisión.
  regimenId?: string | null
  revisionRegimen?: { motivo: string } | null
}

/**
 * S24-6: reconciliación de una ocupación de JEFATURA con un cargo de conducción
 * VACANTE generado desde el organigrama (origen='organigrama', sin ocupación).
 *
 * Si la ocupación entrante es de jefatura (tiene codigo_jefaturas con valor) y
 * existe un cargo origen='organigrama' sin ocupante vigente en ese codigo_repa,
 * se "cubre" ese cargo: pasa a origen='padron' con el id_sial real y el
 * escalafón/puesto del padrón, y se devuelve su id — para que el llamador
 * vincule la ocupación a ÉL en vez de crear un cargo nuevo (evita duplicados).
 *
 * Devuelve el id del cargo vinculado, o null si no aplica (no es jefatura, no
 * hay codigo_repa, o no hay cargo vacante del organigrama que cubrir). El match
 * es por codigo_repa — el escalafón real del padrón manda sobre el que se
 * derivó al generar la vacante.
 *
 * Extraído de aprobarSnapshotService para reutilizarlo en TODOS los flujos del
 * padrón que crean cargos (aprobar diff individual, aprobar todos, transferencia).
 */
export async function reconciliarCargoConduccionVacante(
  tx: TxClient,
  p: ReconciliarParams,
): Promise<string | null> {
  const esJefatura = !!p.codigoJefaturas && p.codigoJefaturas !== '0'
  if (!esJefatura || !p.codigoRepa || !p.idSial) return null

  const cargoVacanteOrg = await tx.cargo.findFirst({
    where: {
      origen: 'organigrama',
      codigoRepa: p.codigoRepa,
      deletedAt: null,
      ocupaciones: { none: { hasta: null } },
    },
    select: { id: true },
  })
  if (!cargoVacanteOrg) return null

  // Al cubrirse con una persona real, deja de ser vacante "fría" a revisar.
  // PERO si el CR o el régimen no se pudieron derivar, el cargo queda a revisión
  // por esas causas (combinadas) en vez de limpiarse. Sólo se limpia la revisión
  // cuando NO hay NINGUNA (ni CR ni régimen).
  const motivos: string[] = []
  if (p.revisionCr) motivos.push(p.revisionCr.motivo)
  if (p.revisionRegimen) motivos.push(p.revisionRegimen.motivo)
  const hayRevision = motivos.length > 0

  await tx.cargo.update({
    where: { id: cargoVacanteOrg.id },
    data: {
      idSial: p.idSial,
      origen: 'padron',
      escalafonId: p.escalafonId,
      literalPuesto: p.literalPuesto ?? null,
      especialidadLegacy: p.especialidadLegacy ?? null,
      codigoRegistroId: p.codigoRegistroId ?? null,
      regimenId: p.regimenId ?? null,
      estado: 'vigente',
      ...(hayRevision
        ? { revisionDato: true, revisionMotivo: motivos.join(' | ').slice(0, 200) }
        : { revisionDato: false, revisionMotivo: null }),
    },
  })

  return cargoVacanteOrg.id
}
