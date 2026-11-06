import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  createConcursoSchema,
  bandejaConcursosQuerySchema,
  bandejaGestionQuerySchema,
} from './concursos.schema.js'
import { createConcursoService } from './concursos.service.js'
import { listBandejaConcursosService } from './bandeja.service.js'
import { listBandejaGestionService } from './bandeja-gestion.service.js'

// Un único endpoint crea tanto concursos CPH como CEETPS (tipoConcurso viene en el
// body, no en la ruta) — deja pasar a quien tenga CUALQUIERA de los dos permisos de
// creación (OR), y la validación cruzada fina (cph solo para concursales_cph, ceetps
// solo para concursales_ceetps) se hace después, a mano, en base al rolSlug.
const WRITE_PERMISOS = [
  { modulo: 'concursos-cph', accion: 'crear' },
  { modulo: 'concursos-ceetps', accion: 'crear' },
]

// Gate de la bandeja mixta: mismo permiso que la pestaña "Concurso" de /cargos
// (cargos/tab:concurso), para que el gate del endpoint y el de la UI sean
// consistentes (ver informe §6).
const BANDEJA_PERMISO = { modulo: 'cargos', accion: 'tab:concurso' }

export async function concursosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /bandeja — PASO 1 flujo concursos: bandeja mixta CPH + CEETPS (lee del
  // Concurso base). No colisiona con POST / (crear). Columnas comunes + tipo.
  app.get('/bandeja', { preHandler: requirePermiso(BANDEJA_PERMISO) }, async (request, reply) => {
    const query = bandejaConcursosQuerySchema.parse(request.query)
    const result = await listBandejaConcursosService(query)
    return reply.send(result)
  })

  // GET /bandeja-gestion — PASO 1b: bandeja RICA (tabla COMPLETA de CPH mudada
  // a "Gestión de Concursos" en /cargos/concurso). Devuelve filas con la forma
  // de ConcursoCph para CPH + CEETPS (opción i, ver bandeja-gestion.service.ts).
  // Mismo gate que la pestaña (cargos/tab:concurso).
  app.get(
    '/bandeja-gestion',
    { preHandler: requirePermiso(BANDEJA_PERMISO) },
    async (request, reply) => {
      const query = bandejaGestionQuerySchema.parse(request.query)
      const result = await listBandejaGestionService(query)
      return reply.send(result)
    },
  )

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
