import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { prefijoDeCargo, siguienteCodigoCargo } from '../../shared/codigoCargo.js'
import type { AutorizacionesQuery } from './autorizaciones.schema.js'

// ─── Helper: crear una autorización ─────────────────────────────────────────
// Se llama desde otros services (CPH, solicitudes-alta) dentro de su propia tx.
// tx puede ser prisma o un PrismaClient de transacción.
export async function crearAutorizacion(
  tx: typeof prisma,
  data: {
    tipo: 'concurso_cph' | 'alta_cargo'
    referenciaId: string
    referenciaTipo: string
    solicitadoPorId: string | undefined
    resolverPorRolSlug: string
  },
) {
  const autorizacion = await tx.autorizacion.create({
    data: {
      tipo:               data.tipo,
      referenciaId:       data.referenciaId,
      referenciaTipo:     data.referenciaTipo,
      resolverPorRolSlug: data.resolverPorRolSlug,
      solicitadoPorId:    data.solicitadoPorId ?? null,
    },
  })

  // Notificación al rol que debe resolver
  await crearNotificacion({
    tipo:       'autorizacion_pendiente',
    rolSlug:    data.resolverPorRolSlug,
    titulo:     'Nueva autorización pendiente',
    mensaje:    `Hay una autorización de tipo "${data.tipo}" esperando tu resolución.`,
    origenTipo: 'autorizacion',
    origenId:   autorizacion.id,
    origenKey:  `autorizacion_pendiente:${autorizacion.id}`,
  })

  return autorizacion
}

// ─── GET / — pendientes del rol del usuario ──────────────────────────────────
export async function listAutorizacionesService(rolSlug: string, query: AutorizacionesQuery) {
  const { page, limit, tipo } = query
  const offset = (page - 1) * limit

  const where = {
    resolverPorRolSlug: rolSlug,
    estado:             'pendiente' as const,
    ...(tipo && { tipo }),
  }

  const [total, data] = await Promise.all([
    prisma.autorizacion.count({ where }),
    prisma.autorizacion.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip:    offset,
      take:    limit,
      include: {
        solicitadoPor: { select: { id: true, username: true, email: true } },
      },
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── GET /mis-pendientes — count para badge ──────────────────────────────────
export async function countPendientesService(rolSlug: string) {
  return prisma.autorizacion.count({
    where: { resolverPorRolSlug: rolSlug, estado: 'pendiente' },
  })
}

// ─── POST /:id/aprobar ───────────────────────────────────────────────────────
export async function aprobarAutorizacionService(
  id: string,
  resueltoPorId: string,
  rolSlug: string,
  observaciones?: string,
) {
  const aut = await prisma.autorizacion.findUnique({ where: { id } })
  if (!aut) throw AppError.notFound('Autorización no encontrada')
  if (aut.resolverPorRolSlug !== rolSlug) throw AppError.forbidden('Sin acceso a esta autorización')
  if (aut.estado !== 'pendiente') throw AppError.badRequest('La autorización ya fue resuelta')

  if (aut.tipo === 'concurso_cph') {
    return _aprobarCph(aut, resueltoPorId, rolSlug, observaciones)
  }
  if (aut.tipo === 'alta_cargo') {
    return _aprobarAltaCargo(aut, resueltoPorId, observaciones)
  }

  throw AppError.badRequest('Tipo de autorización desconocido')
}

// ─── POST /:id/rechazar ──────────────────────────────────────────────────────
export async function rechazarAutorizacionService(
  id: string,
  resueltoPorId: string,
  rolSlug: string,
  observaciones?: string,
) {
  const aut = await prisma.autorizacion.findUnique({ where: { id } })
  if (!aut) throw AppError.notFound('Autorización no encontrada')
  if (aut.resolverPorRolSlug !== rolSlug) throw AppError.forbidden('Sin acceso a esta autorización')
  if (aut.estado !== 'pendiente') throw AppError.badRequest('La autorización ya fue resuelta')

  return prisma.$transaction(async (tx) => {
    const autActualizada = await tx.autorizacion.update({
      where: { id },
      data:  { estado: 'rechazada', resueltoPorId, observaciones: observaciones ?? null },
    })

    if (aut.tipo === 'concurso_cph') {
      // Limpiar flags de cache en ConcursoCph
      await tx.concursoCph.update({
        where: { id: aut.referenciaId },
        data:  { pendienteAutorizacion: false, aprobadoDirector: false },
      })
    }

    if (aut.tipo === 'alta_cargo') {
      await tx.solicitudAlta.update({
        where: { id: aut.referenciaId },
        data:  { estado: 'rechazada', observaciones: observaciones ?? null },
      })
    }

    // Notificar al solicitante
    if (aut.solicitadoPorId) {
      const solicitante = await tx.usuario.findUnique({
        where:  { id: aut.solicitadoPorId },
        select: { role: { select: { slug: true } } },
      })
      if (solicitante?.role.slug) {
        await crearNotificacion({
          tipo:      'autorizacion_resuelta',
          rolSlug:   solicitante.role.slug,
          titulo:    'Autorización rechazada',
          mensaje:   `Tu solicitud de tipo "${aut.tipo}" fue rechazada.${observaciones ? ` Motivo: ${observaciones}` : ''}`,
          origenTipo: 'autorizacion',
          origenId:   aut.id,
          origenKey:  `autorizacion_resuelta:${aut.id}`,
        })
      }
    }

    return autActualizada
  })
}

// ─── Lógica interna: aprobar CPH ─────────────────────────────────────────────
async function _aprobarCph(
  aut: { id: string; referenciaId: string; resolverPorRolSlug: string; solicitadoPorId: string | null; tipo: string },
  resueltoPorId: string,
  rolSlug: string,
  observaciones?: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.autorizacion.update({
      where: { id: aut.id },
      data:  { estado: 'aprobada', resueltoPorId, observaciones: observaciones ?? null },
    })

    const cph = await tx.concursoCph.findUnique({ where: { id: aut.referenciaId } })
    if (!cph) throw AppError.notFound('ConcursoCph no encontrado')

    if (rolSlug === 'director') {
      // Primer paso del flujo estructural: director aprueba → crear autorizacion para sgrasv
      await tx.concursoCph.update({
        where: { id: aut.referenciaId },
        data:  { aprobadoDirector: true },
      })

      // Segunda autorización en cadena para sgrasv
      const autSgrasv = await tx.autorizacion.create({
        data: {
          tipo:               'concurso_cph',
          referenciaId:       aut.referenciaId,
          referenciaTipo:     'concurso_cph',
          resolverPorRolSlug: 'sgrasv',
          solicitadoPorId:    aut.solicitadoPorId,
        },
      })

      await crearNotificacion({
        tipo:      'autorizacion_pendiente',
        rolSlug:   'sgrasv',
        titulo:    'Nueva autorización pendiente',
        mensaje:   'Hay una autorización de concurso CPH esperando tu resolución (segunda etapa).',
        origenTipo: 'autorizacion',
        origenId:   autSgrasv.id,
        origenKey:  `autorizacion_pendiente:${autSgrasv.id}`,
      })

      // Notificar al solicitante que el director aprobó
      if (aut.solicitadoPorId) {
        const solicitante = await tx.usuario.findUnique({
          where:  { id: aut.solicitadoPorId },
          select: { role: { select: { slug: true } } },
        })
        if (solicitante?.role.slug) {
          await crearNotificacion({
            tipo:      'autorizacion_resuelta',
            rolSlug:   solicitante.role.slug,
            titulo:    'Autorización aprobada por director',
            mensaje:   'Tu solicitud CPH fue aprobada por el director. Pendiente de resolución por sgrasv.',
            origenTipo: 'autorizacion',
            origenId:   aut.id,
            origenKey:  `autorizacion_resuelta:${aut.id}`,
          })
        }
      }
    } else {
      // sgrasv aprueba: cierra el flujo
      await tx.concursoCph.update({
        where: { id: aut.referenciaId },
        data:  { pendienteAutorizacion: false, aprobadoDirector: false },
      })

      if (aut.solicitadoPorId) {
        const solicitante = await tx.usuario.findUnique({
          where:  { id: aut.solicitadoPorId },
          select: { role: { select: { slug: true } } },
        })
        if (solicitante?.role.slug) {
          await crearNotificacion({
            tipo:      'autorizacion_resuelta',
            rolSlug:   solicitante.role.slug,
            titulo:    'Autorización aprobada',
            mensaje:   'Tu solicitud CPH fue aprobada.',
            origenTipo: 'autorizacion',
            origenId:   aut.id,
            origenKey:  `autorizacion_resuelta:${aut.id}`,
          })
        }
      }
    }

    return tx.autorizacion.findUnique({ where: { id: aut.id } })
  })
}

// ─── Lógica interna: aprobar alta_cargo ──────────────────────────────────────
async function _aprobarAltaCargo(
  aut: { id: string; referenciaId: string; solicitadoPorId: string | null; tipo: string },
  resueltoPorId: string,
  observaciones?: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.autorizacion.update({
      where: { id: aut.id },
      data:  { estado: 'aprobada', resueltoPorId, observaciones: observaciones ?? null },
    })

    const solicitud = await tx.solicitudAlta.findUnique({
      where:   { id: aut.referenciaId },
      include: { hospital: true, escalafon: true, codigoRegistro: true },
    })
    if (!solicitud) throw AppError.notFound('SolicitudAlta no encontrada')

    const prefijo = prefijoDeCargo({
      escalafon:        solicitud.escalafon.nombre,
      unificadorPuesto: solicitud.unificadorPuesto ?? null,
      agrupador:        solicitud.agrupador ?? null,
    })

    const cargosCreadosIds: string[] = []
    for (let i = 0; i < solicitud.cantidad; i++) {
      const codigo = await siguienteCodigoCargo(prefijo, tx as typeof prisma)
      const cargo = await tx.cargo.create({
        data: {
          idSial:           `MANUAL-${codigo}`,
          codigo,
          hospitalId:       solicitud.hospitalId,
          escalafonId:      solicitud.escalafonId,
          codigoRegistroId: solicitud.codigoRegistroId ?? null,
          literalPuesto:    solicitud.literalPuesto,
          especialidadLegacy: solicitud.especialidad ?? null,
          agrupador:        solicitud.agrupador ?? null,
          unificadorPuesto: solicitud.unificadorPuesto ?? null,
          regimen:          solicitud.regimen ?? null,
          expediente:       solicitud.expediente ?? null,
          fechaDesde:       solicitud.desde ?? null,
          createdById:      resueltoPorId,
          estado:           'vigente',
        },
      })
      cargosCreadosIds.push(cargo.id)
    }

    await tx.solicitudAlta.update({
      where: { id: aut.referenciaId },
      data:  { estado: 'aprobada', cargosCreadosIds },
    })

    // Notificar al solicitante
    if (aut.solicitadoPorId) {
      const solicitante = await tx.usuario.findUnique({
        where:  { id: aut.solicitadoPorId },
        select: { role: { select: { slug: true } } },
      })
      if (solicitante?.role.slug) {
        await crearNotificacion({
          tipo:      'autorizacion_resuelta',
          rolSlug:   solicitante.role.slug,
          titulo:    'Alta de cargo aprobada',
          mensaje:   `Tu solicitud de alta fue aprobada. Se crearon ${cargosCreadosIds.length} cargo(s).`,
          origenTipo: 'autorizacion',
          origenId:   aut.id,
          origenKey:  `autorizacion_resuelta:${aut.id}`,
        })
      }
    }

    return tx.autorizacion.findUnique({ where: { id: aut.id } })
  })
}
