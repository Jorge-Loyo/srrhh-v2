import { Prisma } from '@prisma/client'
import pino from 'pino'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { crearTareaPendiente, mensajeTareaRechazo } from '../tareas/tareas.service.js'
import { prefijoDeCargo, siguienteCodigoCargo } from '../../shared/codigoCargo.js'
import type { AutorizacionesQuery } from './autorizaciones.schema.js'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

// ─── Helper: resolver dinámicamente el slug del rol que resuelve ─────────────
// En vez de hardcodear el slug (que en producción lleva hash, p.ej.
// 'sgrasv_5ac494e'), se resuelve el rol que tiene asignado un permiso concreto
// vía role_permisos → permisos. Única fuente de verdad: la matriz de permisos.

type ResultadoSlugOk = { ok: true; slug: string }
type ResultadoSlugFallo = { ok: false; motivo: 'ninguno' | 'ambiguo'; slugs: string[] }
type ResultadoSlug = ResultadoSlugOk | ResultadoSlugFallo

// Función pura (testeable sin Prisma): aplica la regla de cardinalidad.
// NO ordena; en el caso ambiguo preserva el orden de entrada (el orden
// determinista lo garantiza el orderBy de la query en resolverSlugPorPermiso).
export function elegirSlugResolutor(roles: { slug: string }[]): ResultadoSlug {
  if (roles.length === 0) return { ok: false, motivo: 'ninguno', slugs: [] }
  if (roles.length > 1) return { ok: false, motivo: 'ambiguo', slugs: roles.map((r) => r.slug) }
  return { ok: true, slug: roles[0]!.slug }
}

// Acceso a datos: busca los roles activos que tienen el permiso (modulo, accion)
// con el client transaccional tx, decide con elegirSlugResolutor, y traduce el
// fallo a un AppError.conflict (409) + logger.warn con contexto (el error
// handler NO loguea AppError, así que se loguea acá explícitamente).
export async function resolverSlugPorPermiso(
  tx: Prisma.TransactionClient,
  modulo: string,
  accion: string,
): Promise<string> {
  const roles = await tx.role.findMany({
    where: {
      activo: true,
      permisos: { some: { permiso: { modulo, accion } } },
    },
    select: { slug: true },
    orderBy: { slug: 'asc' },
  })

  const r = elegirSlugResolutor(roles)

  if (!r.ok) {
    // Con `strict: false` (tsconfig del repo) TS no estrecha uniones discriminadas
    // por el booleano `ok`; se referencia la variante de fallo explícitamente.
    const fallo = r as ResultadoSlugFallo
    if (fallo.motivo === 'ninguno') {
      logger.warn({ modulo, accion }, 'resolverSlugPorPermiso: ningún rol con el permiso')
      throw AppError.conflict(
        `No hay un rol configurado para resolver esta autorización ` +
          `(permiso ${modulo}.${accion}). Revisá la matriz de permisos.`,
      )
    }

    // Los slugs (nombres internos de roles, con hash) quedan SOLO en el log del
    // servidor; el 409 al cliente NO los expone.
    logger.warn(
      { modulo, accion, slugs: fallo.slugs },
      'resolverSlugPorPermiso: más de un rol con el permiso',
    )
    throw AppError.conflict(
      `Hay más de un rol con permiso ${modulo}.${accion}; no se puede determinar el ` +
        `resolutor de forma unívoca. Dejá el permiso en un solo rol. ` +
        `(Revisá los logs del servidor para ver los roles en conflicto.)`,
    )
  }

  return (r as ResultadoSlugOk).slug
}

// ─── Helper: crear una autorización ─────────────────────────────────────────
// Se llama desde otros services (CPH, solicitudes-alta) dentro de su propia tx.
// tx puede ser prisma o un PrismaClient de transacción.
export async function crearAutorizacion(
  tx: typeof prisma,
  data: {
    tipo: 'concurso_cph' | 'alta_cargo' | 'baja_cargo'
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
        solicitadoPor: { select: { id: true, username: true, nombre: true, apellido: true } },
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
  if (aut.tipo === 'baja_cargo') {
    return _aprobarBajaCargo(aut, resueltoPorId, observaciones)
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

      // RF3: crear una tarea pendiente para el solicitante ("corregí y reenviá").
      // Dentro de la misma tx; el dedup de crearTareaPendiente evita duplicados.
      if (aut.solicitadoPorId) {
        await crearTareaPendiente(tx as typeof prisma, {
          tipo:                  'rechazo_autorizacion_concurso',
          usuarioDestinatarioId: aut.solicitadoPorId,
          referenciaTipo:        'concurso_cph',
          referenciaId:          aut.referenciaId,
          mensaje:               mensajeTareaRechazo(observaciones),
          creadaPorId:           resueltoPorId,
        })
      } else {
        logger.warn(
          { autorizacionId: aut.id, referenciaId: aut.referenciaId },
          'rechazo sin solicitante: no se crea tarea pendiente (concurso_cph sin solicitadoPorId)',
        )
      }
    }

    if (aut.tipo === 'alta_cargo') {
      await tx.solicitudAlta.update({
        where: { id: aut.referenciaId },
        data:  { estado: 'rechazada', observaciones: observaciones ?? null },
      })
    }

    if (aut.tipo === 'baja_cargo') {
      await tx.baja.update({
        where: { id: aut.referenciaId },
        data:  { estado: 'anulada', observaciones: observaciones ?? null },
      })
      // Revertir el cargo a vigente (corrección administrativa)
      const baja = await tx.baja.findUnique({ where: { id: aut.referenciaId }, select: { cargoId: true } })
      if (baja) {
        await tx.cargo.update({
          where: { id: baja.cargoId },
          data:  { estado: 'vigente', estadoDesde: null },
        })
      }
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

      // Resolver dinámicamente el rol que debe resolver la 2ª autorización:
      // el rol con permiso autorizaciones.resolver_sgrasv (slug real, con hash).
      // Se resuelve con el mismo tx (consistencia transaccional) y antes de
      // crear la fila/notificación, para que el caso 0/>1 lance y haga rollback
      // sin dejar la aprobación del director a medias.
      const slugSgrasv = await resolverSlugPorPermiso(tx, 'autorizaciones', 'resolver_sgrasv')

      // Segunda autorización en cadena para sgrasv
      const autSgrasv = await tx.autorizacion.create({
        data: {
          tipo:               'concurso_cph',
          referenciaId:       aut.referenciaId,
          referenciaTipo:     'concurso_cph',
          resolverPorRolSlug: slugSgrasv,
          solicitadoPorId:    aut.solicitadoPorId,
        },
      })

      await crearNotificacion({
        tipo:      'autorizacion_pendiente',
        rolSlug:   slugSgrasv,
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
      include: { hospital: true, escalafon: true, codigoRegistro: true, puestoCargo: true },
    })
    if (!solicitud) throw AppError.notFound('SolicitudAlta no encontrada')

    const prefijo = prefijoDeCargo({
      escalafon:        solicitud.escalafon.nombre,
      unificadorPuesto: solicitud.unificadorPuesto ?? null,
      agrupador:        solicitud.agrupador ?? null,
      puestoCargo:      solicitud.puestoCargo,
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
          puestoCargoId:      solicitud.puestoCargoId,
          especialidadPuestoId: solicitud.especialidadPuestoId,
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

    // S14-3: determinar si el cargo puede iniciar concurso
    const CPH_CODIGOS    = new Set(['22', '37'])
    const CEETPS_CODIGOS = new Set(['83', '85', '87'])
    const cod = solicitud.escalafon.codigo
    let tipoConcursoSugerido: 'cph' | 'ceetps' | null = null
    if (CPH_CODIGOS.has(cod))    tipoConcursoSugerido = 'cph'
    else if (CEETPS_CODIGOS.has(cod)) tipoConcursoSugerido = 'ceetps'

    const primeroId = cargosCreadosIds[0]!
    const puedeIniciarConcurso = tipoConcursoSugerido !== null

    return {
      autorizacion: await tx.autorizacion.findUnique({ where: { id: aut.id } }),
      puedeIniciarConcurso,
      ...(puedeIniciarConcurso && {
        concursoInfo: {
          cargoId:              primeroId,
          hospitalId:           solicitud.hospitalId,
          codigo:               null as string | null, // se resuelve en el frontend con el id
          literalPuesto:        solicitud.literalPuesto,
          hospitalSigla:        solicitud.hospital.sigla,
          tipoConcursoSugerido: tipoConcursoSugerido as 'cph' | 'ceetps',
          escalafonId:          solicitud.escalafonId,
        },
      }),
    }
  })
}

// ─── Lógica interna: aprobar baja_cargo ──────────────────────────────────────
async function _aprobarBajaCargo(
  aut: { id: string; referenciaId: string; solicitadoPorId: string | null; tipo: string },
  resueltoPorId: string,
  observaciones?: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.autorizacion.update({
      where: { id: aut.id },
      data:  { estado: 'aprobada', resueltoPorId, observaciones: observaciones ?? null },
    })

    await tx.baja.update({
      where: { id: aut.referenciaId },
      data:  { estado: 'confirmada' },
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
          titulo:    'Baja de cargo confirmada',
          mensaje:   'La baja de cargo fue aprobada por el director.',
          origenTipo: 'autorizacion',
          origenId:   aut.id,
          origenKey:  `autorizacion_resuelta:${aut.id}`,
        })
      }
    }

    return tx.autorizacion.findUnique({ where: { id: aut.id } })
  })
}
