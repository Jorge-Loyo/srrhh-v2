// =============================================================================
// Paso 5b — Salto a designación desde una orden de mérito (Etapa 2)
// =============================================================================
// Un concurso de cargo nuevo, ya autorizado y todavía en Etapa 1-2, puede
// designar directo a una persona de una OM vigente de la misma especialidad y
// puesto. El concurso salta a "F — IFACS": se dan por resueltos jurado,
// inscripción, examen y OM propia (NO se copian ni inventan datos de
// esas etapas; IFACS e INSAL siguen siendo pasos normales; ver PASOS_RESUELTOS_POR_OM). La resolución de designación y el
// alta siguen siendo pasos normales de la Etapa 5.
import pino from 'pino'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { TX_OPTS_LARGA } from '../../shared/txOpts.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { recalcularSubEstadoCargo } from '../cargos/subEstado.repo.js'
import { assertEtapa2Habilitada } from './bloqueoEtapa2.js'
import { listOrdenesMeritoVigentesService } from './inscriptos.service.js'
import { getConcursoCphByIdService } from './concursos-cph.service.js'
import { calcConcursoCph } from './concursosCph.calc.js'
import { toCalcInput } from './recalcularCph.js'
import { autorizacionParaCalc } from './autorizacionNuevoCargo.js'
import {
  PASOS_RESUELTOS_POR_OM,
  evaluarElegibilidadOm,
  puedeOfrecerOm,
  type MotivoNoOfrecerOm,
} from './omElegibilidad.js'
import { AUDIT_ACCION_SALTO_OM, AUDIT_ENTIDAD_SALTO_OM, revertirSaltoOm } from './omSaltoRevertir.js'

export { AUDIT_ACCION_SALTO_OM, AUDIT_ENTIDAD_SALTO_OM, revertirSaltoOm }

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

const MENSAJE_NO_OFRECER: Record<MotivoNoOfrecerOm, string> = {
  solo_nuevo_cargo: 'El salto por orden de mérito solo aplica a concursos de cargo nuevo ya autorizados',
  sin_tipo_gestion: 'Guardá el tipo de gestión (centralizado o descentralizado) antes de usar un orden de mérito',
  concurso_finalizado: 'El concurso ya está finalizado',
  concurso_suspendido: 'El concurso está suspendido',
  etapa_avanzada: 'El concurso ya avanzó más allá de la Etapa 2',
  ya_resuelto: 'El concurso ya tiene una designación o un salto por orden de mérito',
  sin_especialidad: 'El concurso no tiene especialidad definida, no se puede buscar un orden de mérito',
}

const destinoInclude = {
  concurso: {
    select: {
      motivoConcurso: true,
      autorizadoAt: true,
      cargo: {
        select: {
          id: true,
          codigo: true,
          hospitalId: true,
          escalafonId: true,
          literalPuesto: true,
          especialidadLegacy: true,
          especialidadPuesto: { select: { nombre: true } },
        },
      },
    },
  },
} as const

// Datos del destino que usan las reglas puras (especialidad/puesto como en
// listOmCompatiblesService: lo solicitado manda sobre lo del cargo).
function especialidadPuestoDestino(d: {
  especialidadSolicitada: string | null
  puestoSolicitado: string | null
  concurso: {
    cargo: {
      literalPuesto: string | null
      especialidadLegacy: string | null
      especialidadPuesto: { nombre: string } | null
    } | null
  } | null
}) {
  const cargo = d.concurso?.cargo
  return {
    especialidad:
      d.especialidadSolicitada ?? cargo?.especialidadPuesto?.nombre ?? cargo?.especialidadLegacy ?? null,
    puesto: d.puestoSolicitado ?? cargo?.literalPuesto ?? null,
  }
}

function paraOfrecer(
  d: {
    estado: string
    suspendido: boolean
    subEstado: string | null
    saltoOmAt: Date | null
    resolucionDesignacion: string | null
    tipoGestion: string | null
    concurso: { motivoConcurso: string | null; autorizadoAt: Date | null } | null
  },
  especialidad: string | null,
) {
  return {
    motivoConcurso: d.concurso?.motivoConcurso ?? null,
    autorizadoAt: d.concurso?.autorizadoAt ?? null,
    estado: d.estado,
    suspendido: d.suspendido,
    subEstado: d.subEstado,
    saltoOmAt: d.saltoOmAt,
    resolucionDesignacion: d.resolucionDesignacion,
    tipoGestion: d.tipoGestion,
    especialidad,
  }
}

// ── GET /:id/om-disponibles ─────────────────────────────────────────────────
export async function listOmDisponiblesService(cphId: string) {
  await assertEtapa2Habilitada(cphId)
  const destino = await prisma.concursoCph.findUnique({
    where: { id: cphId },
    include: destinoInclude,
  })
  if (!destino) throw AppError.notFound('Concurso CPH no encontrado')
  const { especialidad, puesto } = especialidadPuestoDestino(destino)
  const tipoGestionDestino = destino.tipoGestion ?? null
  const puede = puedeOfrecerOm(paraOfrecer(destino, especialidad))
  if (!puede.ok) {
    return { habilitado: false, motivoNoHabilitado: puede.motivo, tipoGestionDestino, ordenes: [] }
  }

  const hoy = new Date()
  const vigentes = await listOrdenesMeritoVigentesService()
  // Datos del concurso de origen que el listado de vigentes no trae.
  const origenes = await prisma.concursoCph.findMany({
    where: { id: { in: [...new Set(vigentes.map((o) => o.concursoCphId))] } },
    select: { id: true, tipoGestion: true, concurso: { select: { cargo: { select: { hospitalId: true, escalafonId: true } } } } },
  })
  const origenPorId = new Map(origenes.map((o) => [o.id, o]))

  const elegibles = vigentes.flatMap((o) => {
    const origen = origenPorId.get(o.concursoCphId)
    const ev = evaluarElegibilidadOm({
      om: o,
      destino: {
        concursoCphId: cphId,
        especialidad,
        puesto,
        tipoGestion: destino.tipoGestion,
        hospitalId: destino.concurso?.cargo?.hospitalId ?? null,
        escalafonId: destino.concurso?.cargo?.escalafonId ?? null,
      },
      origen: {
        tipoGestion: origen?.tipoGestion ?? null,
        hospitalId: origen?.concurso?.cargo?.hospitalId ?? null,
        escalafonId: origen?.concurso?.cargo?.escalafonId ?? null,
      },
      hoy,
    })
    return ev.elegible ? [{ o, origen, advertencias: ev.advertencias }] : []
  })

  // Una persona designada (sin anular) en OTRO concurso no se ofrece.
  const cuils = [...new Set(elegibles.flatMap((e) => e.o.integrantes.map((i) => i.cuil)))]
  const ocupados = cuils.length
    ? await prisma.ordenMeritoIntegrante.findMany({
        where: {
          cuil: { in: cuils },
          designado: true,
          anulado: false,
          concursoCphDesignadoId: { not: cphId },
        },
        select: { cuil: true },
      })
    : []
  const cuilsOcupados = new Set(ocupados.map((x) => x.cuil))

  const ordenes = elegibles
    .map(({ o, advertencias }) => {
      const cargo = o.concursoCph?.concurso?.cargo
      return {
        id: o.id,
        concursoOrigen: {
          id: o.concursoCphId,
          codigo: cargo?.codigo ?? null,
          tipoGestion: origenPorId.get(o.concursoCphId)?.tipoGestion ?? null,
          hospital: { sigla: cargo?.hospital?.sigla ?? null, nombre: cargo?.hospital?.nombre ?? null },
        },
        especialidad: o.especialidad,
        puesto: o.puesto,
        expediente: o.expediente,
        fechaPublicacion: o.fechaPublicacion,
        vigenteHasta: o.fechaProrroga ?? o.fechaVencimiento,
        advertencias,
        integrantes: o.integrantes
          // Libres, o ya reservados a ESTE concurso (la reserva vieja se convierte en salto).
          .filter(
            (i) =>
              !i.anulado &&
              ((!i.designado && !cuilsOcupados.has(i.cuil)) ||
                (i.designado && i.concursoCphDesignadoId === cphId)),
          )
          .map((i) => ({
            id: i.id,
            posicion: i.posicion,
            apellidoNombre: i.apellidoNombre,
            cuil: i.cuil,
          })),
      }
    })
    .filter((o) => o.integrantes.length > 0)

  return { habilitado: true, motivoNoHabilitado: null, tipoGestionDestino, ordenes }
}

// ── POST /:id/om/designar ───────────────────────────────────────────────────
export async function designarDesdeOmService(
  cphId: string,
  integranteId: string,
  opts: { usuarioId: string | null; motivo?: string; ruta?: string },
) {
  // Bloqueo nuevo_cargo sin autorizar: 409 con el mensaje de SGRASV (igual que el resto de Etapa 2).
  await assertEtapa2Habilitada(cphId)

  const resultado = await prisma.$transaction(async (tx) => {
    // 1) Lock de la fila: dos usuarios / doble clic se serializan acá.
    const bloqueada = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM concursos_cph WHERE id = ${cphId}::uuid FOR UPDATE`
    if (!bloqueada || bloqueada.length === 0) throw AppError.notFound('Concurso CPH no encontrado')

    // 2) Relectura con la fila bloqueada.
    const destino = await tx.concursoCph.findUnique({
      where: { id: cphId },
      include: destinoInclude,
    })
    if (!destino) throw AppError.notFound('Concurso CPH no encontrado')
    const { especialidad, puesto } = especialidadPuestoDestino(destino)
    const puede = puedeOfrecerOm(paraOfrecer(destino, especialidad))
    if (!puede.ok) throw AppError.conflict(MENSAJE_NO_OFRECER[puede.motivo!])

    // 3) Integrante, su OM y el concurso de origen.
    const integrante = await tx.ordenMeritoIntegrante.findUnique({
      where: { id: integranteId },
      include: {
        ordenMerito: {
          include: {
            concursoCph: {
              select: {
                id: true,
                tipoGestion: true,
                concurso: { select: { cargo: { select: { codigo: true, hospitalId: true, escalafonId: true } } } },
              },
            },
          },
        },
      },
    })
    if (!integrante) throw AppError.notFound('Integrante de orden de mérito no encontrado')
    if (integrante.anulado) throw AppError.conflict('El integrante está anulado')
    const om = integrante.ordenMerito
    const origen = om.concursoCph
    const ev = evaluarElegibilidadOm({
      om,
      destino: {
        concursoCphId: cphId,
        especialidad,
        puesto,
        tipoGestion: destino.tipoGestion,
        hospitalId: destino.concurso?.cargo?.hospitalId ?? null,
        escalafonId: destino.concurso?.cargo?.escalafonId ?? null,
      },
      origen: {
        tipoGestion: origen?.tipoGestion ?? null,
        hospitalId: origen?.concurso?.cargo?.hospitalId ?? null,
        escalafonId: origen?.concurso?.cargo?.escalafonId ?? null,
      },
      hoy: new Date(),
    })
    if (ev.elegible === false) {
      const msg = {
        propia: 'No se puede usar el orden de mérito del propio concurso',
        vencida: 'La orden de mérito de origen ya no está vigente',
        especialidad_puesto: 'La orden de mérito no es compatible: especialidad o puesto distinto',
        escalafon: 'La orden de mérito no es compatible: pertenece a otra carrera (escalafón)',
      }[ev.motivo]
      throw AppError.conflict(msg)
    }

    // 4) Reserva vieja del MISMO integrante: se convierte en salto. De OTRO: no.
    const otraReserva = await tx.ordenMeritoIntegrante.findFirst({
      where: {
        concursoCphDesignadoId: cphId,
        designado: true,
        anulado: false,
        id: { not: integranteId },
      },
      select: { id: true },
    })
    if (otraReserva) {
      throw AppError.conflict(
        'El concurso ya tiene reservada a otra persona de un orden de mérito: liberá esa reserva antes',
      )
    }

    // 5) Reclamo atómico del integrante (nadie más lo toma entre la lectura y acá).
    const reclamo = await tx.ordenMeritoIntegrante.updateMany({
      where: { id: integranteId, designado: false, anulado: false },
      data: { designado: true, concursoCphDesignadoId: cphId },
    })
    const yaEraDeEsteConcurso = integrante.designado && integrante.concursoCphDesignadoId === cphId
    if (reclamo.count === 0 && !yaEraDeEsteConcurso) {
      throw AppError.conflict('La persona ya fue designada en otro concurso')
    }

    // 6) La misma persona (CUIL) no puede estar designada en otro concurso.
    const mismoCuil = await tx.ordenMeritoIntegrante.findFirst({
      where: {
        cuil: integrante.cuil,
        designado: true,
        anulado: false,
        id: { not: integranteId },
        concursoCphDesignadoId: { not: cphId },
      },
      select: { id: true },
    })
    if (mismoCuil) throw AppError.conflict('La persona ya fue designada en otro concurso')

    // 7) Persona del padrón (por vínculo o por CUIL) o, si no está, referencia por CUIL/nombre.
    const persona = integrante.personaId
      ? { id: integrante.personaId }
      : await tx.persona.findUnique({ where: { cuil: integrante.cuil }, select: { id: true } })
    const personaData = persona
      ? {
          personaDesignadaId: persona.id,
          designadoRefCuil: null,
          designadoRefNombre: null,
          designadoRefIdSialRol: null,
        }
      : {
          personaDesignadaId: null,
          designadoRefCuil: integrante.cuil.slice(0, 11),
          designadoRefNombre: integrante.apellidoNombre.slice(0, 200),
          designadoRefIdSialRol: null,
        }

    // 8) Salto: estado/sub-estados recalculados con saltoOmAt (sin tocar jurado/inscripción/examen/OM/IFACS/INSAL).
    const ahora = new Date()
    const { concurso: _c, ...filaDestino } = destino
    const calc = calcConcursoCph({
      ...toCalcInput({ ...filaDestino, ...personaData, saltoOmAt: ahora, saltoOmIntegranteId: integranteId }),
      autorizacionNuevoCargo: autorizacionParaCalc(destino.concurso, { pendiente: false, autoAprobar: false }),
    })
    await tx.concursoCph.update({
      where: { id: cphId },
      data: {
        saltoOmAt: ahora,
        saltoOmIntegranteId: integranteId,
        ...personaData,
        estado: calc.estado,
        subEstado: calc.subEstado,
        subEstado3: calc.subEstado3,
      },
    })

    // 9) Sub-estado derivado del cargo.
    const cargoId = destino.concurso?.cargo?.id ?? destino.cargoId
    await recalcularSubEstadoCargo(tx, cargoId)

    // 10) Auditoría (no-op: audit_logs dropeada).
    const cargoCodigo = destino.concurso?.cargo?.codigo ?? cphId.slice(0, 8)
    await tx.$queryRaw`SELECT 1`
    return { cargoCodigo, apellidoNombre: integrante.apellidoNombre }
  }, TX_OPTS_LARGA)

  // Aviso post-commit: si falla, se loguea y el salto queda hecho.
  try {
    await crearNotificacion({
      tipo: 'autorizacion_resuelta',
      rolSlug: 'concursales_cph',
      titulo: `Designación desde orden de mérito — ${resultado.cargoCodigo}`,
      mensaje: `${resultado.apellidoNombre} fue designado/a en el cargo ${resultado.cargoCodigo} desde un orden de mérito existente. El concurso pasó a F — IFACS.`,
      origenTipo: 'concurso_cph',
      origenId: cphId,
      origenKey: `designacion_om:${cphId}:${integranteId}`,
    })
  } catch (err) {
    logger.error({ err, cphId, integranteId }, 'designar desde OM: falló el aviso (el salto NO se revierte)')
  }

  return getConcursoCphByIdService(cphId)
}
