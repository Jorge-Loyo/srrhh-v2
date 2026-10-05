import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { listUnidadesFijasService, getUnidadFijaByIdService } from './areas-programaticas.service.js'

export async function unidadesFijasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — CEMAR I-IV, Centros Odontológicos Infantiles, Red de
  // Odontología — estructura fija de la Subsecretaría, sin AP asignada.
  app.get('/', async (_request, reply) => {
    const data = await listUnidadesFijasService()
    return reply.send({ data })
  })

  // GET /:id — detalle: personal vigente (mismo patrón que /cesacs/:id).
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = await getUnidadFijaByIdService(request.params.id)
    return reply.send({ data })
  })
}
