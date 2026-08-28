import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { bajasQuerySchema, createBajaSchema } from './bajas.schema.js'
import { listBajasService, createBajaService } from './bajas.service.js'

const WRITE_ROLES = [
  RolUsuario.ADMIN,
  RolUsuario.EDITOR,
  RolUsuario.CONCURSALES_CPH,
  RolUsuario.CONCURSALES_CEETPS,
]

export async function bajasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — S5-4: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = bajasQuerySchema.parse(request.query)
    const result = await listBajasService(query)
    return reply.send(result)
  })

  // POST / — S5-4 + S5-7: crear baja + marcar cargo no_vigente
  app.post(
    '/',
    { preHandler: requireRole(WRITE_ROLES) },
    async (request, reply) => {
      const body = createBajaSchema.parse(request.body)
      const user = request.user as { id: string }
      const data = await createBajaService(body, user.id)
      return reply.status(201).send({ data })
    }
  )
}
