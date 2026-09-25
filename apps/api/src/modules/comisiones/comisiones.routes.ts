import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { registrarComisionSchema } from './comisiones.schema.js'
import { registrarComisionService, finComisionService } from './comisiones.service.js'

// Reusa el permiso de retenciones — comisión es parte de la gestión de conducción.
const WRITE_PERMISO = { modulo: 'retenciones', accion: 'crear' }

export async function comisionesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST / — S19-6: registrar comisión sobre una ocupación activa
  app.post('/', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const body = registrarComisionSchema.parse(request.body)
    const data = await registrarComisionService(body)
    return reply.send({ data })
  })

  // DELETE /:ocupacionId — S19-7: fin manual de comisión
  app.delete<{ Params: { ocupacionId: string } }>(
    '/:ocupacionId',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await finComisionService(request.params.ocupacionId)
      return reply.send({ data })
    }
  )
}
