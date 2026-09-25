import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { crearJornadaSchema, candidatosJornadaQuerySchema } from './jornadas-sorteo.schema.js'
import {
  listCandidatosService,
  crearJornadaService,
  listJornadasService,
  getJornadaService,
} from './jornadas-sorteo.service.js'

const READ = { modulo: 'concursos-cph', accion: 'ver' }
const WRITE = { modulo: 'concursos-cph', accion: 'crear' }

export async function jornadasSorteoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /candidatos — concursos en B-SORTEO JUR (filtrables por etiqueta)
  app.get('/candidatos', { preHandler: requirePermiso(READ) }, async (request, reply) => {
    const query = candidatosJornadaQuerySchema.parse(request.query)
    const data = await listCandidatosService(query)
    return reply.send({ data })
  })

  // GET / — listado de jornadas
  app.get('/', { preHandler: requirePermiso(READ) }, async (_request, reply) => {
    const data = await listJornadasService()
    return reply.send({ data })
  })

  // GET /:id — detalle de una jornada
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermiso(READ) },
    async (request, reply) => {
      const data = await getJornadaService(request.params.id)
      return reply.send({ data })
    }
  )

  // POST / — crear jornada
  app.post('/', { preHandler: requirePermiso(WRITE) }, async (request, reply) => {
    const body = crearJornadaSchema.parse(request.body)
    const user = request.user as { id?: string } | undefined
    const data = await crearJornadaService(body, user?.id)
    return reply.send({ data })
  })
}
