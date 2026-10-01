import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { dotacionQuerySchema, dotacionKpisQuerySchema } from './dotacion.schema.js'
import { listDotacionService, getDotacionKpisService, exportDotacionService, getDotacionCortesService } from './dotacion.service.js'

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

  // GET /cortes — meses con padrón aprobado para el selector de "Fecha de corte"
  app.get('/cortes', async (_request, reply) => {
    const data = await getDotacionCortesService()
    return reply.send({ data })
  })

  // GET /export — Excel con TODO el resultado del filtro actual (sin paginar).
  // Mismos filtros + uniones que el listado; se genera en el servidor de una
  // sola vez para no chocar con el límite de paginación (max 200).
  app.get('/export', async (request, reply) => {
    const query = dotacionQuerySchema.parse(request.query)
    const { buffer } = await exportDotacionService(query)
    const fecha = new Date().toISOString().slice(0, 10)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="dotacion_${fecha}.xlsx"`)
    return reply.send(buffer)
  })
}
