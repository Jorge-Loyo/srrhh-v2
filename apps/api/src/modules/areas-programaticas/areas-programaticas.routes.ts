import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { listAreasProgramaticasService, getAreaProgramaticaByIdService } from './areas-programaticas.service.js'

export async function areasProgramaticasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — listado de las 13 AP con hospital de referencia y conteos.
  app.get('/', async (_request, reply) => {
    const data = await listAreasProgramaticasService()
    return reply.send({ data })
  })

  // GET /:id — detalle: hospital, CeSACs (con cargos vigentes c/u), total.
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = await getAreaProgramaticaByIdService(request.params.id)
    return reply.send({ data })
  })
}
