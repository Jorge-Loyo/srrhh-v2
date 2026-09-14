import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { bajasQuerySchema, createBajaSchema, updateBajaSchema } from './bajas.schema.js'
import { listBajasService, createBajaService, updateBajaService, getBajaService, listValidacionService, listValidacionHistoricoService, listSoloBajaSialService, confirmarValidacionService, rechazarValidacionService, importarBajasCsvService } from './bajas.service.js'

const WRITE_PERMISO = { modulo: 'bajas', accion: 'crear' }

export async function bajasRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  app.addHook('preHandler', authenticate)

  // POST /importar-csv — actualizar bajas CPH desde CSV semanal
  app.post('/importar-csv', { preHandler: requirePermiso(WRITE_PERMISO) }, async (request, reply) => {
    const data = await request.file()
    if (!data) throw new Error('Archivo requerido')
    const buffer = await data.toBuffer()
    const result = await importarBajasCsvService(buffer)
    return reply.send({ data: result })
  })

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
      const body = updateBajaSchema.parse(request.body)
      const user = request.user as { id: string }
      const data = await updateBajaService(id, body as any, user.id)
      return reply.send({ data })
    }
  )

  // S8B: GET /validacion/solo-baja — en SIAL pero aún activos en padrón
  app.get('/validacion/solo-baja', async (_request, reply) => {
    const data = await listSoloBajaSialService()
    return reply.send({ data })
  })

  // S8B: GET /validacion/historico — cargos no_vigente confirmados
  app.get('/validacion/historico', async (_request, reply) => {
    const data = await listValidacionHistoricoService()
    return reply.send({ data })
  })

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
