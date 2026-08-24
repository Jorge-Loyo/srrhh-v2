import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'

export async function cargosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_request, reply) => {
    // TODO: Sprint 3
    return reply.send({ data: [], meta: { total: 0, page: 1, limit: 50, pages: 0 } })
  })

  app.get('/:id', async (_request, reply) => {
    // TODO: Sprint 3
    return reply.send({ data: null })
  })
}
