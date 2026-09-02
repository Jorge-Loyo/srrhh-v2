import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { NotificacionesQuery } from './notificaciones.schema.js'

// ─── Helper: crear una notificación (con deduplicación por origenKey) ────────
export async function crearNotificacion(data: {
  tipo: 'concurso_estancado' | 'baja_pendiente' | 'autorizacion_pendiente' | 'autorizacion_resuelta'
  rolSlug: string
  titulo: string
  mensaje: string
  origenTipo?: string
  origenId?: string
  origenKey?: string
}) {
  // Si ya existe una notificación no leída con la misma origenKey, no duplicar
  if (data.origenKey) {
    const existe = await prisma.notificacion.findUnique({ where: { origenKey: data.origenKey } })
    if (existe) return existe
  }
  return prisma.notificacion.create({ data })
}

// ─── S10-2: listado paginado (propias del rol del usuario) ───────────────────
export async function listNotificacionesService(rolSlug: string, query: NotificacionesQuery) {
  const { page, limit, tipo, soloNoLeidas } = query
  const offset = (page - 1) * limit

  const where = {
    rolSlug,
    ...(tipo && { tipo }),
    ...(soloNoLeidas && { leida: false }),
  }

  const [total, data] = await Promise.all([
    prisma.notificacion.count({ where }),
    prisma.notificacion.findMany({
      where,
      orderBy: { creadaAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S10-2: contar no leídas (para el badge del header) ─────────────────────
export async function countNoLeidasService(rolSlug: string) {
  return prisma.notificacion.count({ where: { rolSlug, leida: false } })
}

// ─── S10-2: marcar una como leída ───────────────────────────────────────────
export async function marcarLeidaService(id: string, rolSlug: string) {
  const notif = await prisma.notificacion.findUnique({ where: { id } })
  if (!notif) throw AppError.notFound('Notificación no encontrada')
  if (notif.rolSlug !== rolSlug) throw AppError.forbidden('Sin acceso a esta notificación')
  if (notif.leida) return notif
  return prisma.notificacion.update({
    where: { id },
    data: { leida: true, leidaAt: new Date() },
  })
}

// ─── S10-2: marcar todas como leídas ────────────────────────────────────────
export async function marcarTodasLeidasService(rolSlug: string) {
  const { count } = await prisma.notificacion.updateMany({
    where: { rolSlug, leida: false },
    data: { leida: true, leidaAt: new Date() },
  })
  return { actualizadas: count }
}

// ─── S10-5: materializar alertas de estancamiento (on-demand) ───────────────
// Se llama al listar notificaciones. Evalúa concursos CPH y CEETPS activos
// sin movimiento en >30/60/90 días y crea notificaciones si no existen ya.
// La deduplicación por origenKey garantiza que no se dupliquen entre llamadas.
const UMBRALES = [
  { dias: 30, sufijo: '30d', rolSlug: 'concursales_cph' },
  { dias: 60, sufijo: '60d', rolSlug: 'concursales_cph' },
  { dias: 90, sufijo: '90d', rolSlug: 'admin' },
]

export async function materializarAlertasEstancamiento() {
  const ahora = new Date()

  // CPH: activos y no_iniciados no suspendidos
  const concursosCph = await prisma.concursoCph.findMany({
    where: { estado: { in: ['activo', 'no_iniciado'] }, suspendido: false },
    select: {
      id: true,
      subEstado: true,
      updatedAt: true,
      concurso: { select: { cargo: { select: { codigo: true } }, hospital: { select: { sigla: true } } } },
    },
  })

  for (const c of concursosCph) {
    const diasSinMovimiento = Math.floor((ahora.getTime() - c.updatedAt.getTime()) / 86_400_000)
    const cargoCodigo = c.concurso?.cargo?.codigo ?? c.id.slice(0, 8)
    const hospitalSigla = c.concurso?.hospital?.sigla ?? ''

    for (const { dias, sufijo, rolSlug } of UMBRALES) {
      if (diasSinMovimiento < dias) continue
      await crearNotificacion({
        tipo: 'concurso_estancado',
        rolSlug,
        titulo: `Concurso CPH sin movimiento (${dias}+ días)`,
        mensaje: `El concurso ${cargoCodigo} — ${hospitalSigla} lleva ${diasSinMovimiento} días sin actualización. Sub-estado: ${c.subEstado ?? 'N/A'}.`,
        origenTipo: 'concurso_cph',
        origenId: c.id,
        origenKey: `concurso_estancado:cph:${c.id}:${sufijo}`,
      })
    }
  }

  // CEETPS: sin_autorizar y autorizado
  const concursosCeetps = await prisma.concursoCeetps.findMany({
    where: { estado: { in: ['sin_autorizar', 'autorizado', 'en_proceso'] } },
    select: {
      id: true,
      estado: true,
      updatedAt: true,
      concurso: { select: { cargo: { select: { codigo: true } }, hospital: { select: { sigla: true } } } },
    },
  })

  for (const c of concursosCeetps) {
    const diasSinMovimiento = Math.floor((ahora.getTime() - c.updatedAt.getTime()) / 86_400_000)
    const cargoCodigo = c.concurso?.cargo?.codigo ?? c.id.slice(0, 8)
    const hospitalSigla = c.concurso?.hospital?.sigla ?? ''

    for (const { dias, sufijo } of UMBRALES) {
      if (diasSinMovimiento < dias) continue
      await crearNotificacion({
        tipo: 'concurso_estancado',
        rolSlug: 'concursales_ceetps',
        titulo: `Concurso CEETPS sin movimiento (${dias}+ días)`,
        mensaje: `El concurso ${cargoCodigo} — ${hospitalSigla} lleva ${diasSinMovimiento} días sin actualización. Estado: ${c.estado}.`,
        origenTipo: 'concurso_ceetps',
        origenId: c.id,
        origenKey: `concurso_estancado:ceetps:${c.id}:${sufijo}`,
      })
    }
  }
}
