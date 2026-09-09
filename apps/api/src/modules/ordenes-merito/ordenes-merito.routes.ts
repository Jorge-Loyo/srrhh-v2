import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import {
  ordenesMeritoQuerySchema,
  createOrdenMeritoSchema,
  updateOrdenMeritoSchema,
  createIntegranteSchema,
  updateIntegranteSchema,
  alertaQuerySchema,
} from './ordenes-merito.schema.js'
import {
  listOrdenesMeritoService,
  createOrdenMeritoService,
  updateOrdenMeritoService,
  listIntegrantesService,
  createIntegranteService,
  updateIntegranteService,
  deleteIntegranteService,
  alertaOrdenesMeritoService,
} from './ordenes-merito.service.js'

const WRITE_PERMISO = { modulo: 'ordenes_merito', accion: 'crear' }

export async function ordenesMeritoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /alerta?especialidad= — debe ir antes de /:id para no colisionar
  app.get('/alerta', async (request, reply) => {
    const query = alertaQuerySchema.parse(request.query)
    const data = await alertaOrdenesMeritoService(query)
    return reply.send({ data })
  })

  app.get('/', async (request, reply) => {
    const query = ordenesMeritoQuerySchema.parse(request.query)
    const data = await listOrdenesMeritoService(query)
    return reply.send({ data })
  })

  app.post('/', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const body = createOrdenMeritoSchema.parse(request.body)
    const data = await createOrdenMeritoService(body)
    return reply.status(201).send({ data })
  })

  app.patch('/:id', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateOrdenMeritoSchema.parse(request.body)
    const data = await updateOrdenMeritoService(id, body)
    return reply.send({ data })
  })

  // ── Integrantes ────────────────────────────────────────────────────────────

  app.get('/:id/integrantes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await listIntegrantesService(id)
    return reply.send({ data })
  })

  app.post('/:id/integrantes', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createIntegranteSchema.parse(request.body)
    const data = await createIntegranteService(id, body)
    return reply.status(201).send({ data })
  })

  app.patch('/:id/integrantes/:integranteId', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id, integranteId } = request.params as { id: string; integranteId: string }
    const body = updateIntegranteSchema.parse(request.body)
    const data = await updateIntegranteService(id, integranteId, body)
    return reply.send({ data })
  })

  app.delete('/:id/integrantes/:integranteId', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id, integranteId } = request.params as { id: string; integranteId: string }
    await deleteIntegranteService(id, integranteId)
    return reply.status(204).send()
  })
}
