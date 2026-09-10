import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { dotacionQuerySchema, dotacionKpisQuerySchema } from './dotacion.schema.js'
import { listDotacionService, getDotacionKpisService } from './dotacion.service.js'

export async function dotacionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — listado paginado/filtrable de ocupaciones vigentes (tabla de las
  // pantallas "Dotación" / "Dotación Total" migradas del legacy)
  app.get('/', async (request, reply) => {
    const query = dotacionQuerySchema.parse(request.query)
    const result = await listDotacionService(query)
    return reply.send(result)
  })

  // GET /kpis — panel de KPIs de la misma pantalla (distinto de
  // GET /kpis/dotacion, que cuenta cargos vigentes/vacantes; acá se cuenta
  // composición del personal activo)
  app.get('/kpis', async (request, reply) => {
    const query = dotacionKpisQuerySchema.parse(request.query)
    const data = await getDotacionKpisService(query)
    return reply.send({ data })
  })
}
