import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { concursosCphQuerySchema, patchConcursoCphSchema, suspenderConcursoCphSchema } from './concursos-cph.schema.js'
import {
  listConcursosCphService,
  getConcursoCphByIdService,
  patchConcursoCphService,
  suspenderConcursoCphService,
} from './concursos-cph.service.js'

// Escritura: admin/editor (convención ya usada en padronRoutes) + concursales_cph
// (rol dedicado del módulo, ver PLAN_SCRUM_2026.md §3 — "Lectura total +
// escritura concursos CPH y bajas"). Lectura: cualquier usuario autenticado.
const WRITE_ROLES = [RolUsuario.ADMIN, RolUsuario.EDITOR, RolUsuario.CONCURSALES_CPH]

export async function concursosCphRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — S4-1: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = concursosCphQuerySchema.parse(request.query)
    const result = await listConcursosCphService(query)
    return reply.send(result)
  })

  // GET /:id — S4-2: detalle completo
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = await getConcursoCphByIdService(request.params.id)
    return reply.send({ data })
  })

  // PATCH /:id — S4-3: actualizar campos por fase (estado/subEstado calculados, ver S4-4)
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole(WRITE_ROLES) },
    async (request, reply) => {
      const body = patchConcursoCphSchema.parse(request.body)
      const data = await patchConcursoCphService(request.params.id, body)
      return reply.send({ data })
    }
  )

  // POST /:id/suspender — S4-5
  app.post<{ Params: { id: string } }>(
    '/:id/suspender',
    { preHandler: requireRole(WRITE_ROLES) },
    async (request, reply) => {
      const body = suspenderConcursoCphSchema.parse(request.body ?? {})
      const data = await suspenderConcursoCphService(request.params.id, body)
      return reply.send({ data })
    }
  )
}
