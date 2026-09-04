import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { createSolicitudAltaSchema, solicitudesAltaQuerySchema } from './solicitudes-alta.schema.js'
import {
  createSolicitudAltaService,
  listSolicitudesAltaService,
  getSolicitudAltaService,
} from './solicitudes-alta.service.js'

export async function solicitudesAltaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST / --- crear solicitud de alta (genera autorizacion pendiente para director)
  app.post('/', {
    preHandler: requirePermiso({ modulo: 'solicitudes-alta', accion: 'crear' }),
  }, async (request, reply) => {
    const user = request.user as { id: string }
    const body = createSolicitudAltaSchema.parse(request.body)
    const data = await createSolicitudAltaService(body, user.id)
    return reply.status(201).send({ data })
  })

  // GET / --- listado paginado
  app.get('/', {
    preHandler: requirePermiso({ modulo: 'solicitudes-alta', accion: 'ver' }),
  }, async (request, reply) => {
    const query = solicitudesAltaQuerySchema.parse(request.query)
    const result = await listSolicitudesAltaService(query)
    return reply.send(result)
  })

  // GET /:id --- detalle
  app.get('/:id', {
    preHandler: requirePermiso({ modulo: 'solicitudes-alta', accion: 'ver' }),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await getSolicitudAltaService(id)
    return reply.send({ data })
  })
}
