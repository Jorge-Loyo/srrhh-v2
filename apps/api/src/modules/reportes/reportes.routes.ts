import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { reporteDotacionQuerySchema } from './reportes.schema.js'
import { getReporteDotacionService, getEvolutivoEspecialidadService } from './reportes.service.js'

export async function reportesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /dotacion — reporte agregado (Q por dimensión, o cruce de 2
  // dimensiones) sobre las mismas ocupaciones vigentes que expone
  // GET /api/v1/dotacion, con los mismos filtros.
  app.get('/dotacion', async (request, reply) => {
    const query = reporteDotacionQuerySchema.parse(request.query)
    const result = await getReporteDotacionService(query)
    return reply.send(result)
  })

  // GET /evolutivo-especialidad — reporte fijo (sin filtros de usuario),
  // calca la solapa "Evolutivo por Especialidad" del Excel de presupuesto.
  app.get('/evolutivo-especialidad', async (_request, reply) => {
    const result = await getEvolutivoEspecialidadService()
    return reply.send(result)
  })
}
