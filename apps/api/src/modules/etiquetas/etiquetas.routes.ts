import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { etiquetasQuerySchema, createEtiquetaSchema, updateEtiquetaSchema, asignarEtiquetaSchema } from './etiquetas.schema.js'
import { listEtiquetasService, createEtiquetaService, updateEtiquetaService, deleteEtiquetaService, asignarEtiquetaService, desasignarEtiquetaService } from './etiquetas.service.js'

const WRITE_PERMISO = { modulo: 'etiquetas', accion: 'crear' }

export async function etiquetasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    const query = etiquetasQuerySchema.parse(request.query)
    const data = await listEtiquetasService(query)
    return reply.send({ data })
  })

  app.post('/', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const body = createEtiquetaSchema.parse(request.body)
    const data = await createEtiquetaService(body)
    return reply.status(201).send({ data })
  })

  app.patch('/:id', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateEtiquetaSchema.parse(request.body)
    const data = await updateEtiquetaService(id, body)
    return reply.send({ data })
  })

  app.delete('/:id', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteEtiquetaService(id)
    return reply.status(204).send()
  })

  // POST /:id/asignar — body: { entidad, entidadId }
  app.post('/:id/asignar', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = asignarEtiquetaSchema.parse(request.body)
    await asignarEtiquetaService(id, body)
    return reply.status(204).send()
  })

  // DELETE /:id/desasignar — body: { entidad, entidadId }
  app.delete('/:id/desasignar', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = asignarEtiquetaSchema.parse(request.body)
    await desasignarEtiquetaService(id, body)
    return reply.status(204).send()
  })
}
