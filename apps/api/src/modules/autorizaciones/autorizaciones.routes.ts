import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { autorizacionesQuerySchema, resolverAutorizacionSchema } from './autorizaciones.schema.js'
import {
  listAutorizacionesService,
  countPendientesService,
  aprobarAutorizacionService,
  rechazarAutorizacionService,
} from './autorizaciones.service.js'
import { AppError } from '../../shared/errors/AppError.js'

/**
 * CSRF mitigation: enforces Content-Type application/json on state-changing
 * requests. Browsers cannot send this content type cross-origin without a
 * preflight (OPTIONS) request, which is blocked by the CORS policy in app.ts.
 */
function requireJsonContentType(request: FastifyRequest, _reply: FastifyReply, done: () => void) {
  if (!request.headers['content-type']?.includes('application/json')) {
    throw AppError.badRequest('Content-Type must be application/json')
  }
  done()
}

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
    preHandler: [
      requireJsonContentType,
      requirePermiso([
        { modulo: 'autorizaciones', accion: 'resolver_director' },
        { modulo: 'autorizaciones', accion: 'resolver_sgrasv' },
      ]),
    ],
  }, async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const { id } = request.params as { id: string }
    const body = resolverAutorizacionSchema.parse(request.body)
    const data = await aprobarAutorizacionService(id, user.id, user.rolSlug, body.observaciones)
    return reply.send({ data })
  })

  // POST /:id/rechazar
  app.post('/:id/rechazar', {
    preHandler: [
      requireJsonContentType,
      requirePermiso([
        { modulo: 'autorizaciones', accion: 'resolver_director' },
        { modulo: 'autorizaciones', accion: 'resolver_sgrasv' },
      ]),
    ],
  }, async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const { id } = request.params as { id: string }
    const body = resolverAutorizacionSchema.parse(request.body)
    const data = await rechazarAutorizacionService(id, user.id, user.rolSlug, body.observaciones)
    return reply.send({ data })
  })
}
