import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { notificacionesQuerySchema } from './notificaciones.schema.js'
import {
  listNotificacionesService,
  countNoLeidasService,
  marcarLeidaService,
  marcarTodasLeidasService,
  materializarAlertasEstancamiento,
} from './notificaciones.service.js'

export async function notificacionesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — listado paginado de notificaciones del rol del usuario
  // S10-5: materializa alertas de estancamiento on-demand antes de listar
  app.get('/', async (request, reply) => {
    const user = request.user as { rolSlug: string }
    const query = notificacionesQuerySchema.parse(request.query)
    await materializarAlertasEstancamiento()
    const result = await listNotificacionesService(user.rolSlug, query)
    return reply.send(result)
  })

  // GET /no-leidas — contador para el badge del header
  app.get('/no-leidas', async (request, reply) => {
    const user = request.user as { rolSlug: string }
    const count = await countNoLeidasService(user.rolSlug)
    return reply.send({ count })
  })

  // PATCH /leer-todas — marcar todas las del rol como leídas
  // IMPORTANTE: debe registrarse ANTES de /:id/leer para que Fastify no
  // interprete "leer-todas" como un :id
  app.patch('/leer-todas', async (request, reply) => {
    const user = request.user as { rolSlug: string }
    const result = await marcarTodasLeidasService(user.rolSlug)
    return reply.send(result)
  })

  // PATCH /:id/leer — marcar una notificación como leída
  app.patch('/:id/leer', async (request, reply) => {
    const user = request.user as { rolSlug: string }
    const { id } = request.params as { id: string }
    const data = await marcarLeidaService(id, user.rolSlug)
    return reply.send({ data })
  })
}
