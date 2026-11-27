import { Prisma } from '@prisma/client'
import { aplanarFechasCeetps, documentoOrigenDeConcurso, errorEnCadenaFechas } from '@srrhh/types'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { ConcursosCeetpsQuery, PatchConcursoCeetpsBody, DesignarCeetpsBody, AsignarDesignadoCeetpsBody } from './concursos-ceetps.schema.js'
import { cargarConcursoCeetps, cargarConcursoCeetpsEditable } from './concursoEditable.js'
import { quitarTrazasEtl } from './observaciones.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { calcEstadoCeetps } from './concursosCeetps.calc.js'
import {
  MENSAJE_BLOQUEO_ETAPA_2,
  autorizacionParaCalcCeetps,
  debeSolicitarAperturaCeetps,
  excluirNuevoCargoSinAutorizar,
  esNuevoCargoSinAutorizar,
  validarBloqueoEtapa2Ceetps,
} from './autorizacionNuevoCargo.js'
import { autoAprobarConcurso, resolverSlugPorPermiso, usuarioPuedeResolverSgrasv } from '../autorizaciones/autorizaciones.service.js'
import { notificarSgrasvYHijos } from '../notificaciones/notificarSgrasv.js'
import { listarCorreccionesTipo } from '../concursos/corregirTipo.service.js'

const include = {
  // cargo.codigoRegistro: clasificador fino de la carrera —
  // Enfermería(87)/Técnicos(85)/Administrativa(83). Ver comentario en el
  // include original: escalafonId ya separa las tres carreras; codigoRegistro
  // sigue siendo el clasificador fino que usan los documentos exportables.
  concurso: { include: { cargo: { include: { codigoRegistro: true } }, persona: true, baja: true } },
  hospital: true,
  escalafon: true,
  personaDesignada: true,
  etiquetas: { include: { etiqueta: true } },
} satisfies Prisma.ConcursoCeetpsInclude

// Campos cuyo valor string YYYY-MM-DD debe convertirse a Date antes de
// escribir a Prisma (tipo DateTime/Date en el schema).
const CAMPOS_FECHA = new Set<keyof PatchConcursoCeetpsBody>([
  'fechaCaratulacion',
  'fechaAutorizacion',
  'fechaIfacs',
  'fechaInsal',
  'fechaProyectoDispo',
  'fechaAptoMedico',
  'fechaDispoDesignacion',
  'fechaResolucion',
])

// ─── Helper: aplicar rango de fechas al where de Prisma ─────────────────────
function rangoFecha(desde?: string, hasta?: string): Prisma.DateTimeNullableFilter | undefined {
  if (!desde && !hasta) return undefined
  return {
    ...(desde && { gte: new Date(desde) }),
    ...(hasta && { lte: new Date(hasta) }),
  }
}

// ─── S5-1: listado paginado con filtros ─────────────────────────────────────
export async function listConcursosCeetpsService(query: ConcursosCeetpsQuery) {
  const {
    page, limit,
    hospitalId, escalafonId, estado, subEstado,
    fechaCaratulacionDesde, fechaCaratulacionHasta,
    fechaAutorizacionDesde, fechaAutorizacionHasta,
    fechaIfacsDesde, fechaIfacsHasta,
    fechaInsalDesde, fechaInsalHasta,
    search,
  } = query
  const offset = (page - 1) * limit

  const rCaratulacion  = rangoFecha(fechaCaratulacionDesde, fechaCaratulacionHasta)
  const rAutorizacion  = rangoFecha(fechaAutorizacionDesde, fechaAutorizacionHasta)
  const rIfacs         = rangoFecha(fechaIfacsDesde, fechaIfacsHasta)
  const rInsal         = rangoFecha(fechaInsalDesde, fechaInsalHasta)

  const where: Prisma.ConcursoCeetpsWhereInput = {
    ...(hospitalId      && { hospitalId }),
    ...(escalafonId     && { escalafonId }),
    ...(estado          && { estado }),
    ...(subEstado       && { subEstado }),
    ...(rCaratulacion   && { fechaCaratulacion: rCaratulacion }),
    ...(rAutorizacion   && { fechaAutorizacion: rAutorizacion }),
    ...(rIfacs          && { fechaIfacs: rIfacs }),
    ...(rInsal          && { fechaInsal: rInsal }),
    ...(search && {
      OR: [
        { expedienteConcurso:    { contains: search, mode: 'insensitive' } },
        { expedienteConcurso2:   { contains: search, mode: 'insensitive' } },
        { tipificadorOrigen:     { contains: search, mode: 'insensitive' } },
        { puestoSolicitado:      { contains: search, mode: 'insensitive' } },
        { dispoLlamado:          { contains: search, mode: 'insensitive' } },
        { expedienteDesignacion: { contains: search, mode: 'insensitive' } },
        { dispoDesignacion:      { contains: search, mode: 'insensitive' } },
        { resolucionDesignacion: { contains: search, mode: 'insensitive' } },
        { puestoDesignado:       { contains: search, mode: 'insensitive' } },
        { numeroAptoMedico:      { contains: search, mode: 'insensitive' } },
        { codigoSial:            { contains: search, mode: 'insensitive' } },
        { observaciones:         { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  // Listado de /concursos/ceetps: los nuevo_cargo sin autorizar (Etapa 1) no se
  // muestran; siguen en Nuevos cargos y en la bandeja Gestión de Concursos.
  where.AND = [excluirNuevoCargoSinAutorizar()]
  const [total, data] = await Promise.all([
    prisma.concursoCeetps.count({ where }),
    prisma.concursoCeetps.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S5-1: detalle completo ──────────────────────────────────────────────────
export async function getConcursoCeetpsByIdService(id: string) {
  const concursoCeetps = await prisma.concursoCeetps.findUnique({ where: { id }, include })
  if (!concursoCeetps) throw AppError.notFound('Concurso CEETPS no encontrado')
  // Paso 2b: autorización pendiente y último rechazo, solo para nuevo_cargo sin
  // autorizar. Las Autorizacion concurso_ceetps guardan referenciaId = ConcursoCeetps.id.
  const correccionesTipo = await listarCorreccionesTipo(id)
  // Documento de origen (Etapa 1): campo ADITIVO, no toca lo que usa calcEstadoCeetps.
  const documentoOrigen = documentoOrigenDeConcurso({
    motivoConcurso: concursoCeetps.concurso?.motivoConcurso ?? null,
    eeBaja: concursoCeetps.concurso?.baja?.eeBaja ?? null,
    expedienteConcurso: concursoCeetps.concurso?.expediente ?? null,
    expedienteCargo: concursoCeetps.concurso?.cargo?.expediente ?? null,
  })
  if (!esNuevoCargoSinAutorizar(concursoCeetps.concurso)) {
    return {
      ...concursoCeetps,
      autorizacionPendiente: null,
      ultimaAutorizacionRechazada: null,
      correccionesTipo,
      documentoOrigen,
    }
  }
  const [autorizacionPendiente, rechazada] = await Promise.all([
    prisma.autorizacion.findFirst({
      where: { referenciaId: id, tipo: 'concurso_ceetps', estado: 'pendiente' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, resolverPorRolSlug: true, createdAt: true },
    }),
    prisma.autorizacion.findFirst({
      where: { referenciaId: id, tipo: 'concurso_ceetps', estado: 'rechazada' },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        observaciones: true,
        updatedAt: true,
        resueltoPor: { select: { nombre: true, apellido: true, username: true } },
      },
    }),
  ])
  const ultimaAutorizacionRechazada =
    !autorizacionPendiente && rechazada
      ? {
          id: rechazada.id,
          observaciones: rechazada.observaciones,
          resueltaAt: rechazada.updatedAt,
          resueltaPor: rechazada.resueltoPor
            ? [rechazada.resueltoPor.nombre, rechazada.resueltoPor.apellido].filter(Boolean).join(' ') ||
              rechazada.resueltoPor.username
            : null,
        }
      : null
  return {
    ...concursoCeetps,
    observaciones: quitarTrazasEtl(concursoCeetps.observaciones),
    autorizacionPendiente,
    ultimaAutorizacionRechazada,
    correccionesTipo,
    documentoOrigen,
  }
}

// ─── S5-1: actualizar campos por fase — estado y subEstado se recalculan ─────
export async function patchConcursoCeetpsService(id: string, body: PatchConcursoCeetpsBody, usuarioId: string) {
  const existingConConcurso = await prisma.concursoCeetps.findUnique({
    where: { id },
    include: { concurso: { select: { motivoConcurso: true, autorizadoAt: true, cargo: { select: { codigo: true } } } } },
  })
  if (!existingConConcurso) throw AppError.notFound('Concurso CEETPS no encontrado')
  const { concurso: concursoBase, ...existing } = existingConConcurso

  if (existing.estado === 'finalizado' || existing.estado === 'desierto') {
    throw AppError.conflict(`No se puede modificar un concurso ${existing.estado}`)
  }

  // Paso 2b — cargo nuevo: la Etapa 2+ requiere la autorización de SGRASV (409
  // solo si el valor CAMBIA: el formulario reenvía todos los campos). El IF de
  // autorización es opcional: solo el expediente es obligatorio para solicitar.
  validarBloqueoEtapa2Ceetps(concursoBase, body, existing)

  // Las fechas del concurso no pueden ir para atrás (solo se controlan las que cambian).
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  const errorFechas = errorEnCadenaFechas(
    aplanarFechasCeetps({
      fechaCaratulacion: iso(existing.fechaCaratulacion),
      fechaAutorizacion: iso(existing.fechaAutorizacion),
      fechaIfacs: iso(existing.fechaIfacs),
      fechaInsal: iso(existing.fechaInsal),
      fechaAptoMedico: iso(existing.fechaAptoMedico),
      fechaDispoDesignacion: iso(existing.fechaDispoDesignacion),
      cronograma: (existing.cronograma ?? {}) as Record<string, string | null>,
    }),
    aplanarFechasCeetps(body),
  )
  if (errorFechas) throw AppError.badRequest(errorFechas)
  const nuevoSinAutorizar = esNuevoCargoSinAutorizar(concursoBase)
  const hayPendiente = nuevoSinAutorizar
    ? !!(await prisma.autorizacion.findFirst({
        where: { referenciaId: id, tipo: 'concurso_ceetps', estado: 'pendiente' },
        select: { id: true },
      }))
    : false
  const solicitaAutorizacion = debeSolicitarAperturaCeetps({
    concurso: concursoBase,
    body,
    existing,
    pendienteAutorizacion: hayPendiente,
  })
  // Quien completa la Etapa 1 y puede resolver como SGRASV (o es admin) auto-aprueba.
  const autoAprobar = solicitaAutorizacion && (await usuarioPuedeResolverSgrasv(prisma, usuarioId))

  // Etapa 4: el candidato reservado y los que rechazaron deben ser inscriptos de ESTE concurso.
  const idsInscriptos = [
    ...(body.inscriptoReservadoId ? [body.inscriptoReservadoId] : []),
    ...(body.insalRechazados ?? []),
  ]
  if (idsInscriptos.length > 0) {
    const unicos = [...new Set(idsInscriptos)]
    const propios = await prisma.inscriptoCeetps.count({
      where: { id: { in: unicos }, concursoCeetpsId: id },
    })
    if (propios !== unicos.length) {
      throw AppError.badRequest('El candidato no pertenece a los inscriptos de este concurso')
    }
  }

  const patch: Prisma.ConcursoCeetpsUpdateInput = {}
  for (const [key, value] of Object.entries(body) as [keyof PatchConcursoCeetpsBody, unknown][]) {
    if (value === undefined) continue
    const isFecha = CAMPOS_FECHA.has(key)
    ;(patch as Record<string, unknown>)[key] =
      key === 'observaciones' && typeof value === 'string'
        ? quitarTrazasEtl(value)
        : isFecha && typeof value === 'string'
          ? new Date(value)
          : value
  }

  // S20-10: puestoSolicitado (auditoría) se recalcula del catálogo cuando se
  // manda puestoCargoSolicitadoId — el combobox ya no manda el string a mano.
  if ('puestoCargoSolicitadoId' in body) {
    const puestoCargoSolicitadoId = body.puestoCargoSolicitadoId
    if (puestoCargoSolicitadoId) {
      const puesto = await prisma.puestoCargo.findUnique({ where: { id: puestoCargoSolicitadoId } })
      if (!puesto) throw AppError.notFound('Puesto no encontrado en el catálogo')
      patch.puestoSolicitado = puesto.nombre
    } else {
      patch.puestoSolicitado = null
    }
  }

  // Recalcular estado + subEstado a partir del estado merged
  const merged = { ...existing, ...(patch as Partial<typeof existing>) }
  const { estado, subEstado } = calcEstadoCeetps({
    ...merged,
    autorizacionNuevoCargo: autorizacionParaCalcCeetps(concursoBase, {
      pendiente: hayPendiente || solicitaAutorizacion,
      autoAprobar,
    }),
  })

  if (!solicitaAutorizacion) {
    return prisma.concursoCeetps.update({
      where: { id },
      data: { ...patch, estado, subEstado },
      include,
    })
  }

  const cargoCodigo = concursoBase.cargo?.codigo ?? id.slice(0, 8)
  const updated = await prisma.$transaction(async (tx) => {
    await tx.concursoCeetps.update({ where: { id }, data: { ...patch, estado, subEstado } })
    if (autoAprobar) {
      // Autorizada en el acto: traza aprobada + autorizado_at + fechaAutorizacion + recálculo.
      await autoAprobarConcurso(tx, {
        tipo: 'concurso_ceetps',
        referenciaId: id,
        concursoId: existing.concursoId,
        usuarioId,
      })
      await notificarSgrasvYHijos({
        tipo: 'autorizacion_pendiente',
        titulo: `Concurso autorizado automáticamente — ${cargoCodigo}`,
        mensaje: `El concurso CEETPS ${cargoCodigo} fue autorizado automáticamente al completar la Etapa 1 un usuario con permiso de SGRASV.`,
        origenTipo: 'concurso_ceetps',
        origenId: id,
        origenKey: `autorizacion_automatica:${id}`,
      }, tx)
    } else {
      // Paso 3 (2b-c): se relee dentro de la transacción si ya hay una pendiente
      // (el hayPendiente de afuera puede haber quedado viejo por una carrera) y
      // no se crea una segunda autorización ni se duplica el aviso.
      const yaPendiente = await tx.autorizacion.findFirst({
        where: { referenciaId: id, tipo: 'concurso_ceetps', estado: 'pendiente' },
        select: { id: true },
      })
      if (yaPendiente) return tx.concursoCeetps.findUniqueOrThrow({ where: { id }, include })
      const slugSgrasv = await resolverSlugPorPermiso(tx, 'autorizaciones', 'resolver_sgrasv')
      const aut = await tx.autorizacion.create({
        data: {
          tipo: 'concurso_ceetps',
          referenciaId: id,
          referenciaTipo: 'concurso_ceetps',
          solicitadoPorId: usuarioId,
          resolverPorRolSlug: slugSgrasv,
        },
      })
      // notificarSgrasvYHijos cubre SGRASV + descendientes (no se usa crearAutorizacion
      // para no duplicar el aviso al rol SGRASV).
      await notificarSgrasvYHijos({
        tipo: 'autorizacion_pendiente',
        titulo: `Autorización de concurso CEETPS pendiente — ${cargoCodigo}`,
        mensaje: `Hay una autorización de apertura del concurso CEETPS ${cargoCodigo} esperando la resolución de SGRASV.`,
        origenTipo: 'autorizacion',
        origenId: aut.id,
        origenKey: `autorizacion_pendiente:${aut.id}`,
      }, tx)
    }
    return tx.concursoCeetps.findUniqueOrThrow({ where: { id }, include })
  })
  return updated
}

// ─── S16-2: registrar designación — crea Ocupacion, avanza estado a finalizado ──
export async function designarConcursoCeetpsService(id: string, body: DesignarCeetpsBody) {
  const concurso = await prisma.concursoCeetps.findUnique({
    where: { id },
    include: { concurso: { include: { cargo: true } } },
  })
  if (!concurso) throw AppError.notFound('Concurso CEETPS no encontrado')
  if (concurso.estado === 'finalizado') throw AppError.conflict('El concurso ya está finalizado')
  if (concurso.estado === 'desierto')   throw AppError.conflict('El concurso está desierto')
  // Paso 2b: un cargo nuevo no se puede designar sin la autorización de SGRASV.
  if (esNuevoCargoSinAutorizar(concurso.concurso)) throw AppError.conflict(MENSAJE_BLOQUEO_ETAPA_2)

  const persona = await prisma.persona.findUnique({ where: { id: body.personaId } })
  if (!persona) throw AppError.notFound('Persona no encontrada')

  const cargoId = concurso.cargoId

  const ocupActiva = await prisma.ocupacion.findFirst({ where: { cargoId, hasta: null } })
  if (ocupActiva) throw AppError.conflict('El cargo ya tiene una ocupación activa')

  const idSialRol = body.idSialRol ?? `MANUAL-${cargoId.slice(0, 8)}-${body.fechaDesde}`

  return prisma.$transaction(async (tx) => {
    await tx.ocupacion.create({
      data: {
        personaId: body.personaId,
        cargoId,
        idSialRol,
        desde: new Date(body.fechaDesde),
        hasta: null,
      },
    })

    // Designación CEETPS: el cargo queda vigente con ocupación viva -> 'ocupado'.
    await tx.cargo.update({
      where: { id: cargoId },
      data: { estado: 'vigente', estadoDesde: new Date(body.fechaDesde), subEstado: 'ocupado' },
    })

    const updated = await tx.concursoCeetps.update({
      where: { id },
      data: {
        personaDesignadaId: body.personaId,
        estado: 'finalizado',
        subEstado: null,
      },
      include,
    })

    const cargoCodigo = concurso.concurso.cargo?.codigo ?? id.slice(0, 8)
    await crearNotificacion({
      tipo:       'autorizacion_resuelta',
      rolSlug:    'concursales_ceetps',
      titulo:     `Designación registrada — ${cargoCodigo}`,
      mensaje:    `${persona.apellidoNombre} fue designado/a en el cargo ${cargoCodigo}.`,
      origenTipo: 'concurso_ceetps',
      origenId:   id,
      origenKey:  `designacion_ceetps:${id}`,
    })

    return updated
  })
}

// ─── Etapa 5: asignar el designado SIN ocupar el cargo ───────────────────────
// Guarda a quien firmó el INSAL: o una persona ya existente, o una referencia
// (CUIL + nombre). NO crea Persona, NO crea Ocupación y NO toca el Cargo: el
// cargo pasa a ocupado cuando la persona aparezca en el padrón. Si el CUIL de la
// referencia ya es una Persona de la base, se la vincula también.
export async function asignarDesignadoCeetpsService(id: string, body: AsignarDesignadoCeetpsBody) {
  await cargarConcursoCeetpsEditable(id)
  const data: Prisma.ConcursoCeetpsUpdateInput = {}
  if ('refCuil' in body) {
    data.designadoRefCuil = body.refCuil
    data.designadoRefNombre = body.refNombre
    data.designadoRefIdSialRol = body.idSialRol ?? null
    const persona = await prisma.persona.findUnique({ where: { cuil: body.refCuil } })
    data.personaDesignada = persona ? { connect: { id: persona.id } } : { disconnect: true }
  } else {
    const persona = await prisma.persona.findUnique({ where: { id: (body as { personaId: string }).personaId } })
    if (!persona) throw AppError.notFound('Persona no encontrada')
    data.personaDesignada = { connect: { id: persona.id } }
    data.designadoRefCuil = null
    data.designadoRefNombre = null
    data.designadoRefIdSialRol = null
  }
  return prisma.concursoCeetps.update({ where: { id }, data, include })
}

// ─── Etapa 5: el candidato no fue apto → vuelve a la asignación de candidato ──
// Guarda en el historial todo lo que se había cargado de su designación, lo
// excluye del orden de mérito (insalRechazados) y deja la Etapa 5 (y la fecha
// INSAL) en blanco para el próximo candidato. El concurso vuelve a la Etapa 4.
// Si el padrón ya enganchó un ID SIAL, ya no se puede devolver.
export async function registrarNoAptoCeetpsService(id: string) {
  const base = await cargarConcursoCeetpsEditable(id)
  const c = await prisma.concursoCeetps.findUniqueOrThrow({ where: { id } })
  if (c.codigoSial) {
    throw AppError.conflict('El cargo ya tiene un ID SIAL vinculado con el padrón: no se puede devolver el concurso.')
  }

  const inscripto = c.inscriptoReservadoId
    ? await prisma.inscriptoCeetps.findUnique({ where: { id: c.inscriptoReservadoId } })
    : null
  const apellidoNombre = inscripto
    ? `${inscripto.apellido}, ${inscripto.nombre}`
    : c.designadoRefNombre
  if (!apellidoNombre) throw AppError.conflict('No hay un candidato propuesto para marcar como No apto.')

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  const datos = {
    expedienteDesignacion: c.expedienteDesignacion,
    fechaAptoMedico: iso(c.fechaAptoMedico),
    estadoApto: 'NO APTO',
    numeroAptoMedico: c.numeroAptoMedico,
    proyectoResolucion: c.proyectoResolucion,
    dispoDesignacion: c.dispoDesignacion,
    fechaDispoDesignacion: iso(c.fechaDispoDesignacion),
    resoALaFirma: c.resoALaFirma,
    resolucionConvalidacion: c.resolucionConvalidacion,
    fechaIfacs: iso(c.fechaIfacs),
    fechaInsal: iso(c.fechaInsal),
  }

  const limpio = {
    expedienteDesignacion: null,
    fechaAptoMedico: null,
    estadoApto: null,
    numeroAptoMedico: null,
    proyectoResolucion: null,
    dispoDesignacion: null,
    fechaDispoDesignacion: null,
    resolucionConvalidacion: null,
    resoALaFirma: null,
    fechaInsal: null,
  }
  const { estado, subEstado } = calcEstadoCeetps({
    ...c,
    ...limpio,
    autorizacionNuevoCargo: autorizacionParaCalcCeetps(base.concurso, { pendiente: false, autoAprobar: false }),
  })

  return prisma.$transaction(async (tx) => {
    await tx.designacionHistorialCeetps.create({
      data: {
        concursoCeetpsId: id,
        inscriptoId: inscripto?.id ?? null,
        apellidoNombre,
        cuil: inscripto?.cuil ?? c.designadoRefCuil,
        motivo: 'no_apto',
        numeroNota: c.numeroAptoMedico,
        datos,
      },
    })
    return tx.concursoCeetps.update({
      where: { id },
      data: {
        ...limpio,
        inscriptoReservadoId: null,
        insalAceptado: null,
        insalRechazados: inscripto ? [...new Set([...c.insalRechazados, inscripto.id])] : c.insalRechazados,
        designadoRefCuil: null,
        designadoRefNombre: null,
        designadoRefIdSialRol: null,
        personaDesignadaId: null,
        estado,
        subEstado,
      },
      include,
    })
  })
}

export async function listarHistorialDesignacionCeetpsService(id: string) {
  await cargarConcursoCeetps(id)
  return prisma.designacionHistorialCeetps.findMany({
    where: { concursoCeetpsId: id },
    orderBy: { createdAt: 'desc' },
  })
}
