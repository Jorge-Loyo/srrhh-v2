import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { personasQuerySchema } from './personas.schema.js'
import { listPersonasService, getPersonaByIdService, getPersonaBajasSialService } from './personas.service.js'

export async function personasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    const query = personasQuerySchema.parse(request.query)
    const result = await listPersonasService(query)
    return reply.send(result)
  })

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const persona = await getPersonaByIdService(request.params.id)
    return reply.send({ data: persona })
  })

  app.get<{ Params: { id: string } }>('/:id/bajas-sial', async (request, reply) => {
    const data = await getPersonaBajasSialService(request.params.id)
    return reply.send({ data })
  })
}
