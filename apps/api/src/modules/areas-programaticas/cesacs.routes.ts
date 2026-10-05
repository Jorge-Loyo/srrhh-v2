import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { getCesacByIdService } from './areas-programaticas.service.js'

export async function cesacsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /:id — detalle: dirección/barrio/nivel, AP/hospital de referencia,
  // personal vigente (nombre, puesto, escalafón).
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = await getCesacByIdService(request.params.id)
    return reply.send({ data })
  })
}
