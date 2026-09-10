import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { listAuditoriaQuerySchema, purgeAuditoriaSchema } from './auditoria.schema.js'
import { listAuditoriaService, purgeAuditoriaService } from './auditoria.service.js'

// Migración de la pantalla "Auditoría" del módulo Seguridad legacy. Ver vs.
// purgar son capacidades claramente distintas (lectura vs. destrucción de
// historial) — a diferencia de Tokens, acá sí se justifican dos permisos
// nuevos en vez de reusar uno existente.
export async function auditoriaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', { preHandler: requirePermiso({ modulo: 'configuracion', accion: 'ver_auditoria' }) }, async (request, reply) => {
    const query = listAuditoriaQuerySchema.parse(request.query)
    const result = await listAuditoriaService(query)
    return reply.send(result)
  })

  app.post('/purgar', { preHandler: requirePermiso({ modulo: 'configuracion', accion: 'purgar_auditoria' }) }, async (request, reply) => {
    const { dias } = purgeAuditoriaSchema.parse(request.body ?? {})
    const result = await purgeAuditoriaService(dias)
    return reply.send({ data: result })
  })
}
