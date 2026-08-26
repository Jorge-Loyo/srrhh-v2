import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { kpisConcursosCphQuerySchema } from './kpis.schema.js'
import { getKpisConcursosCphService } from './kpis.service.js'

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

  // GET /concursos-cph — S4-11
  app.get('/concursos-cph', async (request, reply) => {
    const { hospitalId } = kpisConcursosCphQuerySchema.parse(request.query)
    const data = await getKpisConcursosCphService(hospitalId)
    return reply.send({ data })
  })
}
