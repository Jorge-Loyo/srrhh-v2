import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import type { ListAuditoriaQuery } from './auditoria.schema.js'

const AUDITORIA_SELECT = {
  id: true,
  usuarioId: true,
  usuario: { select: { username: true } },
  accion: true,
  entidad: true,
  entidadId: true,
  cambios: true,
  ip: true,
  createdAt: true,
} as const

type AuditoriaRow = {
  id: string
  usuarioId: string | null
  usuario: { username: string } | null
  accion: string
  entidad: string
  entidadId: string | null
  cambios: unknown
  ip: string | null
  createdAt: Date
}

// Aplana `usuario: { username } | null` → `username`, mismo criterio que en
// tokens.service.ts / usuarios.service.ts.
function toAuditoriaDto(row: AuditoriaRow) {
  const { usuario, ...rest } = row
  return { ...rest, username: usuario?.username ?? null }
}

export async function listAuditoriaService(query: ListAuditoriaQuery) {
  const { page, limit, accion, entidad, usuarioId, desde, hasta } = query
  const skip = (page - 1) * limit

  const where: Prisma.AuditLogWhereInput = {
    ...(accion && { accion }),
    ...(entidad && { entidad }),
    ...(usuarioId && { usuarioId }),
    ...((desde || hasta) && {
      createdAt: { ...(desde && { gte: desde }), ...(hasta && { lte: hasta }) },
    }),
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: AUDITORIA_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  return { data: rows.map(toAuditoriaDto), meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

export async function purgeAuditoriaService(dias: number) {
  const fechaCorte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: fechaCorte } } })
  return { purgados: count, fechaCorte }
}
