import { Prisma } from '@prisma/client'
import pino from 'pino'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { crearTareaPendiente, mensajeTareaRechazo } from '../tareas/tareas.service.js'
import { prefijoDeCargo, siguienteCodigoCargo } from '../../shared/codigoCargo.js'
import { normalizarCrCphId, type CrCphDb } from '../../shared/crCph.js'
import { recalcularSubEstado, recalcularSubEstadoCargo, type SubEstadoTx } from '../cargos/subEstado.repo.js'
import { esNuevoCargoSinAutorizar } from '../concursos-cph/autorizacionNuevoCargo.js'
import { recalcularCalcCph } from '../concursos-cph/recalcularCph.js'
import { recalcularCalcCeetps } from '../concursos-ceetps/recalcularCeetps.js'
import { tipoConcursoDeCargo } from '../incidencias/incidencias.gestionable.js'
import { crearConcursosAltaAutomaticaTx } from '../concursos/concursos.service.js'
import { notificarSgrasvYHijos } from '../notificaciones/notificarSgrasv.js'
import type { AutorizacionesQuery } from './autorizaciones.schema.js'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

// ─── Gobernanza admin ────────────────────────────────────────────────────────
// El rol `admin` (slug fijo, protegido — ver roles.service.ts) tiene control
// total del flujo: puede resolver CUALQUIER autorización pendiente, sin importar
// a qué rol esté dirigida (resolverPorRolSlug). El resto de los roles solo
// resuelve lo suyo. Mantiene el mismo criterio de bypass que requirePermiso.
function esAdmin(rolSlug: string): boolean {
  return rolSlug === 'admin'
}

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
    tipo: 'concurso_cph' | 'concurso_ceetps' | 'alta_cargo' | 'baja_cargo'
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
  // Admin: gobernanza total, puede resolver cualquier paso dirigido a otro rol.
  if (!esAdmin(rolSlug) && aut.resolverPorRolSlug !== rolSlug) throw AppError.forbidden('Sin acceso a esta autorización')
  if (aut.estado !== 'pendiente') throw AppError.badRequest('La autorización ya fue resuelta')

  if (aut.tipo === 'concurso_cph') {
    return _aprobarCph(aut, resueltoPorId, rolSlug, observaciones)
  }
  if (aut.tipo === 'concurso_ceetps') {
    return _aprobarCeetps(aut, resueltoPorId, observaciones)
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
  // Admin: gobernanza total, puede rechazar cualquier paso dirigido a otro rol.
  if (!esAdmin(rolSlug) && aut.resolverPorRolSlug !== rolSlug) throw AppError.forbidden('Sin acceso a esta autorización')
  if (aut.estado !== 'pendiente') throw AppError.badRequest('La autorización ya fue resuelta')
  // Paso 2a: rechazar una autorización de concurso exige un motivo, que se
  // muestra en la pantalla del concurso. alta_cargo / baja_cargo no cambian.
  if (aut.tipo === 'concurso_cph' || aut.tipo === 'concurso_ceetps') {
    observaciones = observaciones?.trim()
    if (!observaciones) throw AppError.badRequest('La observación es obligatoria para rechazar la autorización')
  }

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
      // Paso 2b: un nuevo_cargo rechazado vuelve a "A Caratulado" (la observación
      // queda en la Autorizacion y se muestra en la pantalla del concurso).
      const cphRech = await tx.concursoCph.findUnique({
        where:  { id: aut.referenciaId },
        select: { concursoId: true },
      })
      if (cphRech?.concursoId) {
        const concRech = await tx.concurso.findUnique({
          where:  { id: cphRech.concursoId },
          select: { motivoConcurso: true, autorizadoAt: true },
        })
        if (esNuevoCargoSinAutorizar(concRech)) {
          await recalcularCalcCph(tx, aut.referenciaId, 'sin_solicitar')
        }
      }

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

    if (aut.tipo === 'concurso_ceetps') {
      // Paso 2b: un nuevo_cargo CEETPS rechazado vuelve a EXP_CARATULADO. La
      // observación queda en la Autorizacion y se muestra en la pantalla del
      // concurso. No hay tarea pendiente (las tareas están atadas a concurso_cph).
      const ceetpsRech = await tx.concursoCeetps.findUnique({
        where:  { id: aut.referenciaId },
        select: { concursoId: true },
      })
      if (!ceetpsRech) throw AppError.notFound('Concurso CEETPS no encontrado')
      const concRech = await tx.concurso.findUnique({
        where:  { id: ceetpsRech.concursoId },
        select: { motivoConcurso: true, autorizadoAt: true },
      })
      if (esNuevoCargoSinAutorizar(concRech)) {
        await recalcularCalcCeetps(tx, aut.referenciaId, 'sin_solicitar')
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
        // Vuelve a vigente: recalcular sub_estado según ocupante/concurso.
        const subEstado = await recalcularSubEstado(tx, baja.cargoId, 'vigente')
        await tx.cargo.update({
          where: { id: baja.cargoId },
          data:  { estado: 'vigente', estadoDesde: null, subEstado },
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
          mensaje:   `Tu solicitud de ${aut.tipo === 'concurso_ceetps' ? 'autorización de concurso CEETPS' : `tipo "${aut.tipo}"`} fue rechazada.${observaciones ? ` Motivo: ${observaciones}` : ''}`,
          origenTipo: 'autorizacion',
          origenId:   aut.id,
          origenKey:  `autorizacion_resuelta:${aut.id}`,
        })
      }
    }

    return autActualizada
  })
}

// ─── Paso 2a: marcar el concurso de cargo nuevo como autorizado ──────────────
// Setea concursos.autorizado_at = now() SOLO si el concurso es nuevo_cargo y aún
// no tiene autorizado_at (nunca re-fecha ni resetea uno existente: una
// autorización estructural posterior de sigla/carrera no lo toca), y recalcula
// el sub_estado del cargo con la misma tx. No toca fechaAutorizacion (manual de
// la Etapa 2). Devuelve true si autorizó.
export async function marcarConcursoAutorizado(tx: SubEstadoTx, concursoId: string): Promise<boolean> {
  const concurso = await tx.concurso.findUnique({
    where:  { id: concursoId },
    select: { cargoId: true, motivoConcurso: true, autorizadoAt: true },
  })
  if (!esNuevoCargoSinAutorizar(concurso)) return false
  // updateMany con autorizadoAt:null: atómico frente a una aprobación concurrente.
  const { count } = await tx.concurso.updateMany({
    where: { id: concursoId, autorizadoAt: null },
    data:  { autorizadoAt: new Date() },
  })
  if (count === 0) return false
  await recalcularSubEstadoCargo(tx, concurso!.cargoId)
  return true
}

// ─── Paso 2b: permiso de SGRASV y auto-aprobación ────────────────────────────
// Misma regla que requirePermiso: admin siempre; el resto, por role_permisos.
export async function usuarioPuedeResolverSgrasv(
  tx: Prisma.TransactionClient,
  usuarioId: string,
): Promise<boolean> {
  const u = await tx.usuario.findUnique({
    where:  { id: usuarioId },
    select: { role: { select: { id: true, slug: true } } },
  })
  if (!u?.role) return false
  if (esAdmin(u.role.slug)) return true
  const fila = await tx.rolePermiso.findFirst({
    where: { roleId: u.role.id, permiso: { modulo: 'autorizaciones', accion: 'resolver_sgrasv' } },
  })
  return !!fila
}

async function completarFechaAutorizacionCph(tx: Prisma.TransactionClient, cphId: string) {
  await tx.concursoCph.updateMany({
    where: { id: cphId, fechaAutorizacion: null },
    data:  { fechaAutorizacion: new Date() },
  })
}

async function completarFechaAutorizacionCeetps(tx: Prisma.TransactionClient, ceetpsId: string) {
  await tx.concursoCeetps.updateMany({
    where: { id: ceetpsId, fechaAutorizacion: null },
    data:  { fechaAutorizacion: new Date() },
  })
}

// Quien completa la Etapa 1 y puede resolver como SGRASV aprueba en el mismo acto:
// deja una Autorizacion ya aprobada (traza), marca el concurso autorizado y
// recalcula el sub-estado. marcarConcursoAutorizado sigue siendo la única que
// escribe autorizado_at.
export async function autoAprobarConcurso(
  tx: Prisma.TransactionClient,
  data: { tipo: 'concurso_cph' | 'concurso_ceetps'; referenciaId: string; concursoId: string | null; usuarioId: string },
) {
  const usuario = await tx.usuario.findUnique({
    where:  { id: data.usuarioId },
    select: { role: { select: { slug: true } } },
  })
  const autorizacion = await tx.autorizacion.create({
    data: {
      tipo:               data.tipo,
      referenciaId:       data.referenciaId,
      referenciaTipo:     data.tipo,
      estado:             'aprobada',
      resolverPorRolSlug: usuario?.role.slug ?? 'admin',
      solicitadoPorId:    data.usuarioId,
      resueltoPorId:      data.usuarioId,
      observaciones:      'Autorizada automáticamente por el usuario que completó la Etapa 1 (permiso de SGRASV).',
    },
  })
  if (data.concursoId) await marcarConcursoAutorizado(tx, data.concursoId)
  if (data.tipo === 'concurso_ceetps') {
    await completarFechaAutorizacionCeetps(tx, data.referenciaId)
    await recalcularCalcCeetps(tx, data.referenciaId, 'autorizado')
  } else {
    await completarFechaAutorizacionCph(tx, data.referenciaId)
    await recalcularCalcCph(tx, data.referenciaId, 'autorizado')
  }
  return autorizacion
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

    // Qué paso de la cadena es se determina por la autorización (resolverPorRolSlug),
    // NO por el rol del usuario: el admin puede resolver ambos pasos y su rolSlug
    // ('admin') no coincide con 'director' ni con el slug de sgrasv. La primera
    // autorización CPH se crea siempre con resolverPorRolSlug === 'director'
    // (concursos-cph.service.ts); la segunda, con el slug dinámico de sgrasv.
    const esPasoDirector = aut.resolverPorRolSlug === 'director'

    if (esPasoDirector) {
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

      // Paso 2a: concurso de cargo nuevo → queda AUTORIZADO y el cargo se recalcula
      // (pasa a 'concurso') en esta misma transacción. El paso del director NO llega acá.
      // Paso 2b: además completa fechaAutorizacion (solo si estaba vacía) y salta a
      // "B Sorteo de jurado" recalculando el sub-estado.
      if (cph.concursoId && (await marcarConcursoAutorizado(tx, cph.concursoId))) {
        await completarFechaAutorizacionCph(tx, aut.referenciaId)
        await recalcularCalcCph(tx, aut.referenciaId, 'autorizado')
      }

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

// ─── Lógica interna: aprobar concurso CEETPS (cargo nuevo) ───────────────────
// Una sola autorización (SGRASV). Setea autorizado_at (atómico e idempotente vía
// marcarConcursoAutorizado), completa fechaAutorizacion si estaba vacía y pasa
// el concurso a 'autorizado'.
async function _aprobarCeetps(
  aut: { id: string; referenciaId: string; solicitadoPorId: string | null },
  resueltoPorId: string,
  observaciones?: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.autorizacion.update({
      where: { id: aut.id },
      data:  { estado: 'aprobada', resueltoPorId, observaciones: observaciones ?? null },
    })

    const ceetps = await tx.concursoCeetps.findUnique({ where: { id: aut.referenciaId } })
    if (!ceetps) throw AppError.notFound('Concurso CEETPS no encontrado')

    if (await marcarConcursoAutorizado(tx, ceetps.concursoId)) {
      await completarFechaAutorizacionCeetps(tx, aut.referenciaId)
      await recalcularCalcCeetps(tx, aut.referenciaId, 'autorizado')
    }

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
          mensaje:   'Tu solicitud de autorización de concurso CEETPS fue aprobada.',
          origenTipo: 'autorizacion',
          origenId:   aut.id,
          origenKey:  `autorizacion_resuelta:${aut.id}`,
        })
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
      tieneEspecialidad: Boolean(solicitud.especialidadPuestoId),
    })

    // CPH: el CR 22 es un duplicado del 37 — el cargo se crea siempre con el 37.
    const crIdCargo = await normalizarCrCphId(tx as unknown as CrCphDb, solicitud.codigoRegistroId)
    const cargosCreadosIds: string[] = []
    for (let i = 0; i < solicitud.cantidad; i++) {
      const codigo = await siguienteCodigoCargo(prefijo, tx as typeof prisma)
      const cargo = await tx.cargo.create({
        data: {
          idSial:           `MANUAL-${codigo}`,
          codigo,
          hospitalId:       solicitud.hospitalId,
          escalafonId:      solicitud.escalafonId,
          codigoRegistroId: crIdCargo ?? null,
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
          // Alta aprobada: cargo vigente sin ocupante ni concurso -> 'vacante'.
          subEstado:        'vacante',
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

    // Paso 3: se crea AUTOMÁTICAMENTE un concurso "no iniciado" por cada cargo
    // nuevo (motivo nuevo_cargo, sin autorizar), en esta misma transacción: si
    // falla la creación de uno, se revierte toda la aprobación. Tipo por CÓDIGO
    // DE REGISTRO (no escalafón): CPH {37,22,23}, CEETPS {85,87} + 83-AnexoII.
    // Fuente de verdad: tipoConcursoDeCargo. Tipo null => sin concurso (el
    // usuario define el tipo después; se informa en la respuesta y en el log).
    const tipoConcurso = tipoConcursoDeCargo({
      codigoRegistro: solicitud.codigoRegistro?.codigo ?? null,
      literalPuesto: solicitud.literalPuesto,
    })
    const auto = await crearConcursosAltaAutomaticaTx(
      tx,
      {
        cargoIds: cargosCreadosIds,
        hospitalId: solicitud.hospitalId,
        escalafonId: solicitud.escalafonId,
        expediente: solicitud.expediente ?? null,
        tipoConcurso,
      },
      resueltoPorId,
    )
    if (auto.sinTipo > 0) {
      logger.warn(
        { autorizacionId: aut.id, solicitudId: solicitud.id, cargos: auto.sinTipo },
        'alta_cargo aprobada: cargos sin tipo de concurso (CR fuera de CPH/CEETPS); no se crea concurso automático',
      )
    }
    if (auto.creados.length > 0) {
      const hospitalSigla = solicitud.hospital.sigla
      await notificarSgrasvYHijos(
        {
          tipo: 'concurso_iniciado',
          titulo: `Concursos nuevos pendientes de caratular — ${hospitalSigla}`,
          mensaje: `El alta de cargo aprobada generó ${auto.creados.length} concurso(s) ${auto.creados[0]!.tipoConcurso.toUpperCase()} sin iniciar (${solicitud.literalPuesto ?? 'cargo nuevo'}, ${hospitalSigla}). Falta caratular y autorizar.`,
          origenTipo: 'autorizacion',
          origenId: aut.id,
          origenKey: `concursos_alta_automaticos:${aut.id}`,
        },
        tx,
      )
    }

    return {
      autorizacion: await tx.autorizacion.findUnique({ where: { id: aut.id } }),
      concursosCreados: auto.creados.length,
      concursosYaExistentes: auto.yaExistentes,
      concursosSinTipo: auto.sinTipo,
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
