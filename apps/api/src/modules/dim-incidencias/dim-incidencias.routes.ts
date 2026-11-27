import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  dimIncidenciasQuerySchema,
  iniciarConcursoBodySchema,
  descartarBodySchema,
  dimConcursosQuerySchema,
} from './dim-incidencias.schema.js'
import {
  listDimIncidenciasService,
  iniciarConcursoService,
  descartarIncidenciaService,
  getDimIncidenciaContextoService,
  getAnalisisCargaService,
  listDimConcursosService,
  getDimConcursoService,
} from './dim-incidencias.service.js'

export async function dimIncidenciasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── Incidencias ────────────────────────────────────────────────────────────

  app.get(
    '/',
    { preHandler: requirePermiso({ modulo: 'dim_incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const query = dimIncidenciasQuerySchema.parse(request.query)
      return reply.send(await listDimIncidenciasService(query))
    },
  )

  app.get(
    '/analisis',
    { preHandler: requirePermiso({ modulo: 'dim_incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const { sesionId } = request.query as { sesionId?: string }
      return reply.send({ data: await getAnalisisCargaService(sesionId) })
    },
  )

  app.get(
    '/:id/contexto',
    { preHandler: requirePermiso({ modulo: 'dim_incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      if (!id?.trim()) throw AppError.badRequest('id requerido')
      return reply.send({ data: await getDimIncidenciaContextoService(id) })
    },
  )

  app.post(
    '/:id/iniciar-concurso',
    { preHandler: requirePermiso({ modulo: 'dim_incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      if (!id?.trim()) throw AppError.badRequest('id requerido')
      const body = iniciarConcursoBodySchema.parse(request.body)
      const concurso = await iniciarConcursoService(id, body.observaciones)
      return reply.code(201).send({ data: concurso })
    },
  )

  app.post(
    '/:id/descartar',
    { preHandler: requirePermiso({ modulo: 'dim_incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      if (!id?.trim()) throw AppError.badRequest('id requerido')
      const body = descartarBodySchema.parse(request.body)
      const inc = await descartarIncidenciaService(id, body.motivo)
      return reply.send({ data: inc })
    },
  )

  // ── Concursos ──────────────────────────────────────────────────────────────

  app.get(
    '/concursos',
    { preHandler: requirePermiso({ modulo: 'dim_incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const query = dimConcursosQuerySchema.parse(request.query)
      return reply.send(await listDimConcursosService(query))
    },
  )

  app.get(
    '/concursos/:id',
    { preHandler: requirePermiso({ modulo: 'dim_incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      if (!id?.trim()) throw AppError.badRequest('id requerido')
      return reply.send({ data: await getDimConcursoService(id) })
    },
  )
}
