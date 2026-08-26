import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { createConcursoSchema } from './concursos.schema.js'
import { createConcursoService } from './concursos.service.js'

// Mismos roles de escritura que concursos-cph/concursos-ceetps.
const WRITE_ROLES = [RolUsuario.ADMIN, RolUsuario.EDITOR, RolUsuario.CONCURSALES_CPH, RolUsuario.CONCURSALES_CEETPS]

export async function concursosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST / — S4-6: crear concurso (cascada a ConcursoCph/ConcursoCeetps según tipoConcurso)
  app.post('/', { preHandler: requireRole(WRITE_ROLES) }, async (request, reply) => {
    const body = createConcursoSchema.parse(request.body)
    const user = request.user as { id: string }
    const data = await createConcursoService(body, user.id)
    return reply.status(201).send({ data })
  })
}
