import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { personasQuerySchema } from './personas.schema.js'
import { listPersonasService, getPersonaByIdService } from './personas.service.js'

export async function personasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — S3-1 + S3-3: listado paginado, full-text search + filtros
  app.get('/', async (request, reply) => {
    const query = personasQuerySchema.parse(request.query)
    const result = await listPersonasService(query)
    return reply.send(result)
  })

  // GET /:id — S3-2: detalle con ocupaciones
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const persona = await getPersonaByIdService(request.params.id)
    return reply.send({ data: persona })
  })
}
