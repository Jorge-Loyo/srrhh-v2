import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { tareasQuerySchema, kanbanSupervisorQuerySchema, asignarConcursoSchema } from './tareas.schema.js'
import {
  listTareasService,
  countTareasPendientesService,
  resolverTareaService,
  getKanbanSgrasvService,
  getKanbanSupervisorService,
  asignarConcursoService,
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

  // GET /kanban-sgrasv — kanban de gestión por supervisor
  app.get('/kanban-sgrasv', {
    preHandler: requirePermiso({ modulo: 'tareas', accion: 'ver_kanban_sgrasv' }),
  }, async (_request, reply) => {
    const data = await getKanbanSgrasvService()
    return reply.send({ data })
  })

  // GET /kanban-supervisor — kanban propio del supervisor
  app.get('/kanban-supervisor', {
    preHandler: requirePermiso({ modulo: 'tareas', accion: 'ver_kanban_supervisor' }),
  }, async (request, reply) => {
    const user  = request.user as { id: string }
    const query = kanbanSupervisorQuerySchema.parse(request.query)
    const data  = await getKanbanSupervisorService(user.id, query.novedadesDias)
    return reply.send({ data })
  })

  // POST /asignar — asignar o liberar un concurso
  app.post('/asignar', { preHandler: [
    requireJsonContentType,
    requirePermiso({ modulo: 'tareas', accion: 'asignar_concurso' }),
  ] }, async (request, reply) => {
    const user = request.user as { id: string; rolSlug: string }
    const body = asignarConcursoSchema.parse(request.body)
    const data = await asignarConcursoService(
      body.referenciaId, body.referenciaTipo, body.usuarioId,
      user.id, user.rolSlug,
    )
    return reply.send({ data })
  })
}
