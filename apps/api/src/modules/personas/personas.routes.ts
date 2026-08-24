import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'

export async function personasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    // TODO: Sprint 3 — implementar listado paginado con full-text search
    return reply.send({ data: [], meta: { total: 0, page: 1, limit: 50, pages: 0 } })
  })

  app.get('/:id', async (request, reply) => {
    // TODO: Sprint 3
    return reply.send({ data: null })
  })
}
