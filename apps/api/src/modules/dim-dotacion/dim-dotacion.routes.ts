import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { dimDotacionQuerySchema, dimDotacionKpisQuerySchema } from './dim-dotacion.schema.js'
import {
  listDimDotacionService,
  getDimDotacionKpisService,
  getDimActividadDetalleService,
  listDimEfectoresService,
  listDimCarrerasService,
  listDimPuestosService,
} from './dim-dotacion.service.js'

export async function dimDotacionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  /**
   * GET /
   * Listado paginado de actividad actual (dim_actividad_hechos WHERE fecha_hasta IS NULL).
   * Reemplaza /dotacion para el contexto MSGC.
   */
  app.get(
    '/',
    { preHandler: requirePermiso({ modulo: 'dotacion', accion: 'ver' }) },
    async (request, reply) => {
      const query = dimDotacionQuerySchema.parse(request.query)
      const result = await listDimDotacionService(query)
      return reply.send(result)
    },
  )

  /**
   * GET /kpis
   * KPIs de actividad actual: totales, por situación de revista, por carrera, por efector.
   */
  app.get(
    '/kpis',
    { preHandler: requirePermiso({ modulo: 'dotacion', accion: 'ver' }) },
    async (request, reply) => {
      const query = dimDotacionKpisQuerySchema.parse(request.query)
      const data = await getDimDotacionKpisService(query)
      return reply.send({ data })
    },
  )

  /**
   * GET /actividad/:idSialRol
   * Historial completo de actividad de un id_sial_rol (todas las filas, no solo la actual).
   */
  app.get(
    '/actividad/:idSialRol',
    { preHandler: requirePermiso({ modulo: 'dotacion', accion: 'ver' }) },
    async (request, reply) => {
      const { idSialRol } = request.params as { idSialRol: string }
      if (!idSialRol?.trim()) throw AppError.badRequest('idSialRol requerido')
      const data = await getDimActividadDetalleService(idSialRol)
      return reply.send({ data })
    },
  )

  /**
   * GET /efectores
   * Catálogo de efectores activos desde dim_efectores.
   * Reemplaza GET /api/v1/hospitales para el contexto MSGC.
   */
  app.get(
    '/efectores',
    { preHandler: requirePermiso({ modulo: 'dotacion', accion: 'ver' }) },
    async (_request, reply) => {
      const data = await listDimEfectoresService()
      return reply.send({ data })
    },
  )

  /**
   * GET /carreras
   * Catálogo de carreras activas desde dim_carreras.
   * Reemplaza GET /api/v1/codigos-registro para el contexto MSGC.
   */
  app.get(
    '/carreras',
    { preHandler: requirePermiso({ modulo: 'dotacion', accion: 'ver' }) },
    async (_request, reply) => {
      const data = await listDimCarrerasService()
      return reply.send({ data })
    },
  )

  /**
   * GET /puestos?efector=&codigoRegistro=
   * Catálogo de pares (literalPuesto, especialidad) únicos desde dim_puestos.
   * Reemplaza GET /api/v1/puestos-cargo para el contexto MSGC.
   */
  app.get(
    '/puestos',
    { preHandler: requirePermiso({ modulo: 'dotacion', accion: 'ver' }) },
    async (request, reply) => {
      const { efector, codigoRegistro } = request.query as {
        efector?: string
        codigoRegistro?: string
      }
      const data = await listDimPuestosService({ efector, codigoRegistro })
      return reply.send({ data })
    },
  )
}
