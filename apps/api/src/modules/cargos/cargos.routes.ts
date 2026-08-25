import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { cargosQuerySchema } from './cargos.schema.js'
import { listCargosService, getCargoByIdService } from './cargos.service.js'

export async function cargosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — S3-4 + S3-3: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = cargosQuerySchema.parse(request.query)
    const result = await listCargosService(query)
    return reply.send(result)
  })

  // GET /:id — S3-5: detalle con ocupación actual
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const cargo = await getCargoByIdService(request.params.id)
    return reply.send({ data: cargo })
  })
}
