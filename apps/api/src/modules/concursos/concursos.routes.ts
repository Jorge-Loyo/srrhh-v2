import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { RolUsuario } from '@srrhh/types'
import { createConcursoSchema } from './concursos.schema.js'
import { createConcursoService } from './concursos.service.js'

// Roles por tipo de concurso: cada rol solo puede crear el tipo que le corresponde.
// admin/editor pueden crear cualquiera.
const WRITE_ROLES_CPH = [RolUsuario.ADMIN, RolUsuario.EDITOR, RolUsuario.CONCURSALES_CPH]
const WRITE_ROLES_CEETPS = [RolUsuario.ADMIN, RolUsuario.EDITOR, RolUsuario.CONCURSALES_CEETPS]
const WRITE_ROLES_ALL = [RolUsuario.ADMIN, RolUsuario.EDITOR, RolUsuario.CONCURSALES_CPH, RolUsuario.CONCURSALES_CEETPS]

export async function concursosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST / — S4-6: crear concurso (cascada a ConcursoCph/ConcursoCeetps según tipoConcurso)
  // La validación de rol se hace en el service después de parsear el body,
  // porque el tipo de concurso viene en el body (no en la ruta).
  app.post('/', { preHandler: requireRole(WRITE_ROLES_ALL) }, async (request, reply) => {
    const body = createConcursoSchema.parse(request.body)
    const user = request.user as { id: string; rol: string }
    // Bug 2: concursales_ceetps no puede crear CPH y viceversa
    if (body.tipoConcurso === 'cph' && user.rol === RolUsuario.CONCURSALES_CEETPS) {
      throw AppError.forbidden('concursales_ceetps no puede crear concursos CPH')
    }
    if (body.tipoConcurso === 'ceetps' && user.rol === RolUsuario.CONCURSALES_CPH) {
      throw AppError.forbidden('concursales_cph no puede crear concursos CEETPS')
    }
    const data = await createConcursoService(body, user.id)
    return reply.status(201).send({ data })
  })
}
