import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { concursosCphQuerySchema, patchConcursoCphSchema, suspenderConcursoCphSchema } from './concursos-cph.schema.js'
import { z } from 'zod'
import {
  listConcursosCphService,
  getConcursoCphByIdService,
  patchConcursoCphService,
  suspenderConcursoCphService,
  aprobarAutorizacionCphService,
} from './concursos-cph.service.js'

// Escritura: permiso concursos-cph.editar (ver /configuracion/permisos — por defecto
// admin/editor/concursales_cph, editable en caliente). Lectura: cualquier autenticado.
const WRITE_PERMISO = { modulo: 'concursos-cph', accion: 'editar' }

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
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = patchConcursoCphSchema.parse(request.body)
      const data = await patchConcursoCphService(request.params.id, body)
      return reply.send({ data })
    }
  )

  // POST /:id/suspender — S4-5
  app.post<{ Params: { id: string } }>(
    '/:id/suspender',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = suspenderConcursoCphSchema.parse(request.body ?? {})
      const data = await suspenderConcursoCphService(request.params.id, body)
      return reply.send({ data })
    }
  )

  // POST /:id/autorizar — aprobar o rechazar modificación pendiente (rol sgrasv)
  app.post<{ Params: { id: string } }>(
    '/:id/autorizar',
    { preHandler: requirePermiso({ modulo: 'concursos-cph', accion: 'autorizar' }) },
    async (request, reply) => {
      const { aprobado, observaciones } = z.object({
        aprobado: z.boolean(),
        observaciones: z.string().trim().max(2000).optional(),
      }).parse(request.body)
      const data = await aprobarAutorizacionCphService(request.params.id, request.user.rolSlug, aprobado, observaciones)
      return reply.send({ data })
    }
  )
}
