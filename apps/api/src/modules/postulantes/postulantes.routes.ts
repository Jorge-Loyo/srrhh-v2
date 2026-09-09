import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import {
  postulantesQuerySchema,
  createPostulanteSchema,
  updatePostulanteSchema,
  createPostulacionSchema,
  updatePostulacionSchema,
} from './postulantes.schema.js'
import {
  listPostulantesService,
  getPostulanteService,
  createPostulanteService,
  updatePostulanteService,
  listPostulacionesService,
  createPostulacionService,
  updatePostulacionService,
  getPostulanteByCuilService,
} from './postulantes.service.js'

const WRITE_PERMISO = { modulo: 'postulantes', accion: 'crear' }

export async function postulantesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /cuil/:cuil — debe ir antes de /:id para no colisionar
  app.get('/cuil/:cuil', async (request, reply) => {
    const { cuil } = request.params as { cuil: string }
    const data = await getPostulanteByCuilService(cuil)
    return reply.send({ data })
  })

  app.get('/', async (request, reply) => {
    const query = postulantesQuerySchema.parse(request.query)
    const data = await listPostulantesService(query)
    return reply.send({ data })
  })

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await getPostulanteService(id)
    return reply.send({ data })
  })

  app.post('/', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const body = createPostulanteSchema.parse(request.body)
    const data = await createPostulanteService(body)
    return reply.status(201).send({ data })
  })

  app.patch('/:id', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updatePostulanteSchema.parse(request.body)
    const data = await updatePostulanteService(id, body)
    return reply.send({ data })
  })

  // ── Postulaciones ──────────────────────────────────────────────────────────

  app.get('/:id/postulaciones', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await listPostulacionesService(id)
    return reply.send({ data })
  })

  app.post('/:id/postulaciones', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createPostulacionSchema.parse(request.body)
    const data = await createPostulacionService(id, body)
    return reply.status(201).send({ data })
  })

  app.patch('/:id/postulaciones/:postulacionId', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id, postulacionId } = request.params as { id: string; postulacionId: string }
    const body = updatePostulacionSchema.parse(request.body)
    const data = await updatePostulacionService(id, postulacionId, body)
    return reply.send({ data })
  })
}
