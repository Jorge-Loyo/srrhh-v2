import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../prisma.js'

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function auditLog(request: FastifyRequest, _reply: FastifyReply) {
  if (!WRITE_METHODS.includes(request.method)) return

  const user = request.user as { id: string } | undefined
  if (!user) return

  const parts = request.url.split('/')
  const entidad = parts[3] ?? 'unknown' // /api/v1/{entidad}/...
  const entidadId = parts.find((p) => UUID_RE.test(p)) ?? null

  await prisma.auditLog.create({
    data: {
      usuarioId: user.id,
      accion: request.method.toLowerCase(),
      entidad,
      entidadId,
      ip: request.ip,
    },
  })
}
