import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', { preHandler: [requireRole([RolUsuario.ADMIN])] }, async (_request, reply) => {
    // TODO: Sprint 1 — listar usuarios
    return reply.send({ data: [] })
  })
}
