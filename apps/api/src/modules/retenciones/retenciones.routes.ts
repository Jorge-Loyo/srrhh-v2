import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { registrarRetencionSchema, titularCesaSchema, renovarPeriodoSchema } from './retenciones.schema.js'
import {
  registrarRetencionService,
  getCadenaRetencionService,
  getCargoConRemplazanteService,
  titularCesaService,
  listValidacionRetencionesService,
  listRetenidosService,
  renovarPeriodoService,
} from './retenciones.service.js'

const WRITE_PERMISO = { modulo: 'retenciones', accion: 'crear' }
const READ_PERMISO = { modulo: 'retenciones', accion: 'ver' }

export async function retencionesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // POST / — S18-4: registrar retención + generar cargo R/TTR
  app.post(
    '/',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = registrarRetencionSchema.parse(request.body)
      const data = await registrarRetencionService(body)
      return reply.send({ data })
    }
  )

  // GET /validacion — personas con 2+ cargos activos sin retención/comisión formalizada
  app.get('/validacion', { preHandler: requirePermiso(READ_PERMISO) }, async (_request, reply) => {
    const data = await listValidacionRetencionesService()
    return reply.send({ data })
  })

  // GET /retenidos — cargos ya retenidos (situacionRevista = 'Retencion de Cargo')
  app.get('/retenidos', { preHandler: requirePermiso(READ_PERMISO) }, async (_request, reply) => {
    const data = await listRetenidosService()
    return reply.send({ data })
  })

  // GET /cadena/:cargoId — S18-4: cadena completa desde el base
  app.get<{ Params: { cargoId: string } }>(
    '/cadena/:cargoId',
    { preHandler: requirePermiso(READ_PERMISO) },
    async (request, reply) => {
      const data = await getCadenaRetencionService(request.params.cargoId)
      return reply.send({ data })
    }
  )

  // GET /cargo/:cargoId — S18-4: detalle del cargo + su remplazante directo
  app.get<{ Params: { cargoId: string } }>(
    '/cargo/:cargoId',
    { preHandler: requirePermiso(READ_PERMISO) },
    async (request, reply) => {
      const data = await getCargoConRemplazanteService(request.params.cargoId)
      return reply.send({ data })
    }
  )

  // POST /titular-cesa — S18-9: ocupante del R hereda el cargo titular
  app.post(
    '/titular-cesa',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = titularCesaSchema.parse(request.body)
      const data = await titularCesaService(body)
      return reply.send({ data })
    }
  )

  // PATCH /:cargoId/renovar — S19-5: renovar el período de un cargo TTR
  app.patch<{ Params: { cargoId: string } }>(
    '/:cargoId/renovar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = renovarPeriodoSchema.parse(request.body)
      const data = await renovarPeriodoService(request.params.cargoId, body)
      return reply.send({ data })
    }
  )
}
