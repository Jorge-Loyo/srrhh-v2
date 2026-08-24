import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../prisma.js'

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE']

export async function auditLog(request: FastifyRequest, _reply: FastifyReply) {
  if (!WRITE_METHODS.includes(request.method)) return

  const user = request.user as { id: string } | undefined
  if (!user) return

  const parts = request.url.split('/')
  const entidad = parts[3] ?? 'unknown' // /api/v1/{entidad}/...
  const entidadId = parts[4] ?? null

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
