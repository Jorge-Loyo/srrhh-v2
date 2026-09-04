import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { autorizacionesQuerySchema, resolverAutorizacionSchema } from './autorizaciones.schema.js'
import {
  listAutorizacionesService,
  countPendientesService,
  aprobarAutorizacionService,
  rechazarAutorizacionService,
} from './autorizaciones.service.js'

export async function autorizacionesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — pendientes del rol del usuario
  app.get('/', {
    preHandler: requirePermiso({ modulo: 'autorizaciones', accion: 'ver' }),
  }, async (request, reply) => {
    const user  = request.user as { rolSlug: string }
    const query = autorizacionesQuerySchema.parse(request.query)
    const result = await listAutorizacionesService(user.rolSlug, query)
    return reply.send(result)
  })

  // GET /mis-pendientes — count para badge (separado del de notificaciones)
  app.get('/mis-pendientes', async (request, reply) => {
    const user  = request.user as { rolSlug: string }
    const count = await countPendientesService(user.rolSlug)
    return reply.send({ count })
  })

  // POST /:id/aprobar
  app.post('/:id/aprobar', {
    preHandler: requirePermiso([
      { modulo: 'autorizaciones', accion: 'resolver_director' },
      { modulo: 'autorizaciones', accion: 'resolver_sgrasv' },
    ]),
  }, async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const { id } = request.params as { id: string }
    const body = resolverAutorizacionSchema.parse(request.body)
    const data = await aprobarAutorizacionService(id, user.id, user.rolSlug, body.observaciones)
    return reply.send({ data })
  })

  // POST /:id/rechazar
  app.post('/:id/rechazar', {
    preHandler: requirePermiso([
      { modulo: 'autorizaciones', accion: 'resolver_director' },
      { modulo: 'autorizaciones', accion: 'resolver_sgrasv' },
    ]),
  }, async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const { id } = request.params as { id: string }
    const body = resolverAutorizacionSchema.parse(request.body)
    const data = await rechazarAutorizacionService(id, user.id, user.rolSlug, body.observaciones)
    return reply.send({ data })
  })
}
