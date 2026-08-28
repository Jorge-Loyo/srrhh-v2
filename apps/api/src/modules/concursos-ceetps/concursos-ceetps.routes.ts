import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { concursosCeetpsQuerySchema, patchConcursoCeetpsSchema } from './concursos-ceetps.schema.js'
import {
  listConcursosCeetpsService,
  getConcursoCeetpsByIdService,
  patchConcursoCeetpsService,
} from './concursos-ceetps.service.js'

const WRITE_ROLES = [RolUsuario.ADMIN, RolUsuario.EDITOR, RolUsuario.CONCURSALES_CEETPS]

export async function concursosCeetpsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — S5-1: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = concursosCeetpsQuerySchema.parse(request.query)
    const result = await listConcursosCeetpsService(query)
    return reply.send(result)
  })

  // GET /:id — S5-1: detalle completo
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = await getConcursoCeetpsByIdService(request.params.id)
    return reply.send({ data })
  })

  // PATCH /:id — S5-1: actualizar campos por fase (estado calculado server-side)
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole(WRITE_ROLES) },
    async (request, reply) => {
      const body = patchConcursoCeetpsSchema.parse(request.body)
      const data = await patchConcursoCeetpsService(request.params.id, body)
      return reply.send({ data })
    }
  )
}
