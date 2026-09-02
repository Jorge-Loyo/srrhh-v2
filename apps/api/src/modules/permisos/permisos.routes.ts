import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { getCatalogo } from './permisos.service.js'

export async function permisosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requirePermiso({ modulo: 'configuracion', accion: 'gestionar_permisos' }))

  app.get('/', async (_request, reply) => {
    const permisos = await getCatalogo()
    return reply.send({ data: permisos })
  })
}
