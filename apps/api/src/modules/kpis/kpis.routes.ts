import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'

export async function kpisRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/dotacion', async (_request, reply) => {
    // TODO: Sprint 6
    return reply.send({ data: null })
  })

  app.get('/concursos', async (_request, reply) => {
    // TODO: Sprint 6
    return reply.send({ data: null })
  })
}
