import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { tareasQuerySchema } from './tareas.schema.js'
import {
  listTareasService,
  countTareasPendientesService,
  resolverTareaService,
} from './tareas.service.js'
import { AppError } from '../../shared/errors/AppError.js'

/**
 * CSRF mitigation: enforces Content-Type application/json on state-changing
 * requests. Copia local del mismo patrón de autorizaciones.routes.ts — no hay
 * un helper compartido para esto.
 */
function requireJsonContentType(request: FastifyRequest, _reply: FastifyReply, done: () => void) {
  if (!request.headers['content-type']?.includes('application/json')) {
    throw AppError.badRequest('Content-Type must be application/json')
  }
  done()
}

export async function tareasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — listado paginado de las tareas visibles para el usuario
  app.get('/', async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const query = tareasQuerySchema.parse(request.query)
    const result = await listTareasService(user.id, user.rolSlug, query)
    return reply.send(result)
  })

  // GET /pendientes — contador para el badge del header
  app.get('/pendientes', async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const count = await countTareasPendientesService(user.id, user.rolSlug)
    return reply.send({ count })
  })

  // POST /:id/resolver — marcar una tarea como resuelta
  app.post('/:id/resolver', { preHandler: [requireJsonContentType] }, async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const { id } = request.params as { id: string }
    const data = await resolverTareaService(id, user.id, user.rolSlug)
    return reply.send({ data })
  })
}
