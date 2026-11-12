import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { bajasQuerySchema, camposDiferidosSchema, createBajaSchema, updateBajaSchema, vinculacionQuerySchema } from './bajas.schema.js'
// FASE 6: listValidacionService, listValidacionHistoricoService,
// listSoloBajaSialService y listClasificacionVacantesService ya NO se importan
// acá: sus endpoints GET se retiraron (sólo servían a la pantalla jubilada
// ValidacionBajasPage). Las funciones siguen existiendo en bajas.service.ts.
import { listBajasService, createBajaService, updateBajaService, anularBajaService, updateCamposDiferidosService, getBajaService, listVinculacionService, confirmarValidacionService, rechazarValidacionService, importarBajasCsvService } from './bajas.service.js'

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

  // S17-5: GET /vinculacion — bajas confirmadas y su estado de vinculación al padrón
  app.get('/vinculacion', async (request, reply) => {
    const query = vinculacionQuerySchema.parse(request.query)
    const data = await listVinculacionService(query)
    return reply.send({ data })
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

  // POST /:id/anular — anular un borrador (resolucion_a_la_firma → anulada).
  // NO toca el cargo ni crea concurso (el borrador nunca confirmó nada).
  app.post(
    '/:id/anular',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user as { id: string }
      const data = await anularBajaService(id, user.id)
      return reply.send({ data })
    }
  )

  // PATCH /:id/campos-diferidos — completar Doc. respaldatoria y Fecha pase
  // paralelo/GT sin tocar estado/cargo/concurso (endpoint dedicado, ver service)
  app.patch(
    '/:id/campos-diferidos',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = camposDiferidosSchema.parse(request.body)
      const data = await updateCamposDiferidosService(id, body)
      return reply.send({ data })
    }
  )

  // FASE 6: los 4 GET de solo-vista (/validacion, /validacion/historico,
  // /validacion/solo-baja, /validacion/clasificacion) se RETIRARON de la API.
  // Sólo servían a la pantalla ValidacionBajasPage, ya jubilada de la
  // navegación; su función la cubren las pestañas nuevas de Incidencias. Las
  // funciones de servicio (listValidacionService, listValidacionHistoricoService,
  // listSoloBajaSialService, listClasificacionVacantesService) se CONSERVAN en
  // bajas.service.ts (no se borran; enfoque conservador), simplemente dejan de
  // exponerse por HTTP. Los POST confirmar/rechazar SE MANTIENEN (los usa
  // confirmarValidacionService/rechazarValidacionService, que conservan la regla
  // datosTrasConfirmar viva del pipeline).

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
