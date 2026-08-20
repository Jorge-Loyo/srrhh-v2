import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'

export async function padronRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/snapshots', async (_request, reply) => {
    // TODO: Sprint 2 — listar snapshots
    return reply.send({ data: [] })
  })

  app.post('/upload', async (_request, reply) => {
    // TODO: Sprint 2 — recibir Excel, crear snapshot, enviar a Python
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Pendiente Sprint 2' } })
  })

  app.get('/snapshots/:id/diff', async (_request, reply) => {
    // TODO: Sprint 2
    return reply.send({ data: null })
  })

  app.post('/snapshots/:id/aprobar', async (_request, reply) => {
    // TODO: Sprint 2
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Pendiente Sprint 2' } })
  })

  app.post('/snapshots/:id/rechazar', async (_request, reply) => {
    // TODO: Sprint 2
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Pendiente Sprint 2' } })
  })
}
