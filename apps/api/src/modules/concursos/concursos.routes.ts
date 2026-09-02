import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { createConcursoSchema } from './concursos.schema.js'
import { createConcursoService } from './concursos.service.js'

// Un único endpoint crea tanto concursos CPH como CEETPS (tipoConcurso viene en el
// body, no en la ruta) — deja pasar a quien tenga CUALQUIERA de los dos permisos de
// creación (OR), y la validación cruzada fina (cph solo para concursales_cph, ceetps
// solo para concursales_ceetps) se hace después, a mano, en base al rolSlug.
const WRITE_PERMISOS = [
  { modulo: 'concursos-cph', accion: 'crear' },
  { modulo: 'concursos-ceetps', accion: 'crear' },
]

export async function concursosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST / — S4-6: crear concurso (cascada a ConcursoCph/ConcursoCeetps según tipoConcurso)
  app.post('/', { preHandler: requirePermiso(WRITE_PERMISOS) }, async (request, reply) => {
    const body = createConcursoSchema.parse(request.body)
    const user = request.user as { id: string; rolSlug: string }
    if (body.tipoConcurso === 'cph' && user.rolSlug === 'concursales_ceetps') {
      throw AppError.forbidden('concursales_ceetps no puede crear concursos CPH')
    }
    if (body.tipoConcurso === 'ceetps' && user.rolSlug === 'concursales_cph') {
      throw AppError.forbidden('concursales_cph no puede crear concursos CEETPS')
    }
    const data = await createConcursoService(body, user.id)
    return reply.status(201).send({ data })
  })
}
