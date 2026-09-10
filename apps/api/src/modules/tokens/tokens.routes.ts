import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { listTokensQuerySchema } from './tokens.schema.js'
import { listTokensService, revokeTokenService, revokeAllForUserService } from './tokens.service.js'

// Migración de la pantalla "Tokens" del módulo Seguridad legacy — reutiliza
// el permiso gestionar_usuarios (gestionar sesiones es la misma
// responsabilidad que gestionar usuarios, no amerita un permiso propio).
export async function tokensRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requirePermiso({ modulo: 'configuracion', accion: 'gestionar_usuarios' }))

  app.get('/', async (request, reply) => {
    const query = listTokensQuerySchema.parse(request.query)
    const result = await listTokensService(query)
    return reply.send(result)
  })

  app.patch<{ Params: { id: string } }>('/:id/revocar', async (request, reply) => {
    const token = await revokeTokenService(request.params.id)
    return reply.send({ data: token })
  })

  app.patch<{ Params: { usuarioId: string } }>('/usuario/:usuarioId/revocar-todos', async (request, reply) => {
    const result = await revokeAllForUserService(request.params.usuarioId)
    return reply.send({ data: result })
  })
}
