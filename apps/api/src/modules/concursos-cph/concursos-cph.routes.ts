import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'

export async function concursosCphRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_request, reply) => {
    // TODO: Sprint 4
    return reply.send({ data: [], meta: { total: 0, page: 1, limit: 50, pages: 0 } })
  })

  app.get('/:id', async (_request, reply) => {
    // TODO: Sprint 4
    return reply.send({ data: null })
  })

  app.patch('/:id', async (_request, reply) => {
    // TODO: Sprint 4
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Pendiente Sprint 4' } })
  })

  app.post('/:id/suspender', async (_request, reply) => {
    // TODO: Sprint 4
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Pendiente Sprint 4' } })
  })
}
