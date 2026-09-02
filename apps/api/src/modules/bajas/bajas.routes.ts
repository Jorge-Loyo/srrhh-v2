import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { bajasQuerySchema, createBajaSchema } from './bajas.schema.js'
import { listBajasService, createBajaService, updateBajaService, getBajaService, listValidacionService, confirmarValidacionService, rechazarValidacionService } from './bajas.service.js'

const WRITE_PERMISO = { modulo: 'bajas', accion: 'crear' }

export async function bajasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — S5-4: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = bajasQuerySchema.parse(request.query)
    const result = await listBajasService(query)
    return reply.send(result)
  })

  // GET /:id — detalle de una baja
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = await getBajaService(id)
    return reply.send({ data })
  })

  // POST / — S5-4 + S5-7: crear baja + marcar cargo no_vigente
  app.post(
    '/',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = createBajaSchema.parse(request.body)
      const user = request.user as { id: string }
      const data = await createBajaService(body, user.id)
      return reply.status(201).send({ data })
    }
  )

  // PATCH /:id — actualizar borrador (resolucion_a_la_firma → pendiente/confirmada)
  app.patch(
    '/:id',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = createBajaSchema.parse(request.body)
      const user = request.user as { id: string }
      const data = await updateBajaService(id, body, user.id)
      return reply.send({ data })
    }
  )

  // S8B: GET /validacion — cargos en validacion_vacante
  app.get('/validacion', async (_request, reply) => {
    const data = await listValidacionService()
    return reply.send({ data })
  })

  // S8B: POST /validacion/:cargoId/confirmar
  app.post(
    '/validacion/:cargoId/confirmar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const { cargoId } = request.params as { cargoId: string }
      const { actaAdministrativa } = (request.body ?? {}) as { actaAdministrativa?: string }
      const data = await confirmarValidacionService(cargoId, actaAdministrativa)
      return reply.send({ data })
    }
  )

  // S8B: POST /validacion/:cargoId/rechazar
  app.post(
    '/validacion/:cargoId/rechazar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const { cargoId } = request.params as { cargoId: string }
      const data = await rechazarValidacionService(cargoId)
      return reply.send({ data })
    }
  )
}
