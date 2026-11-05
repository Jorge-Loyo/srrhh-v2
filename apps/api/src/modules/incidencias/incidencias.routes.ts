import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import {
  buscarConcursosQuerySchema,
  vincularConcursoSchema,
  crearConcursoParaIdSialSchema,
  bajaSinConcursoQuerySchema,
  todoQuerySchema,
  resumenQuerySchema,
  persistidaQuerySchema,
} from './incidencias.schema.js'
import { listarBajaSinConcurso } from './incidencias.baja-sin-concurso.js'
import { listarTodo, resumenIncidencias, listarPersistidas } from './incidencias.tipos.js'
import {
  getPendientesService,
  buscarConcursosParaIdSialService,
  crearCargoParaIdSialService,
  crearConcursoParaIdSialService,
  transferenciaParaIdSialService,
  sinCodigoParaIdSialService,
} from './incidencias.service.js'

// Incidencias (FASE 1): ventana de acciones sobre los id_sial NUEVOS que
// quedaron pendientes (aprobado=null) tras aprobar un padrón. Trabaja por diffId
// (el snapshotId se resuelve dentro del service).
export async function incidenciasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /pendientes — cola §4.2 de id_sial nuevos sin gestionar.
  app.get(
    '/pendientes',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'ver' }) },
    async (_request, reply) => {
      const result = await getPendientesService()
      return reply.send({ data: result })
    },
  )

  // GET /pendientes/:diffId/concursos?q= — concursos CPH candidatos a vincular.
  app.get<{ Params: { diffId: string }; Querystring: { q?: string } }>(
    '/pendientes/:diffId/concursos',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const { q } = buscarConcursosQuerySchema.parse(request.query)
      const result = await buscarConcursosParaIdSialService(request.params.diffId, q)
      return reply.send({ data: result })
    },
  )

  // POST /pendientes/:diffId/crear-cargo — crear el cargo del id_sial nuevo.
  app.post<{ Params: { diffId: string } }>(
    '/pendientes/:diffId/crear-cargo',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const user = request.user as { id: string }
      const result = await crearCargoParaIdSialService(request.params.diffId, user.id)
      return reply.send({ data: result })
    },
  )

  // POST /pendientes/:diffId/vincular-concurso — crear el cargo ocupando el
  // cargo de un concurso CPH existente.
  app.post<{ Params: { diffId: string }; Body: { concursoCphId: string } }>(
    '/pendientes/:diffId/vincular-concurso',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const { concursoCphId } = vincularConcursoSchema.parse(request.body)
      const user = request.user as { id: string }
      const result = await crearCargoParaIdSialService(request.params.diffId, user.id, concursoCphId)
      return reply.send({ data: result })
    },
  )

  // POST /pendientes/:diffId/crear-concurso — crear un concurso para el id_sial.
  app.post<{ Params: { diffId: string } }>(
    '/pendientes/:diffId/crear-concurso',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const body = crearConcursoParaIdSialSchema.parse(request.body)
      const user = request.user as { id: string }
      const result = await crearConcursoParaIdSialService(request.params.diffId, body, user.id)
      return reply.send({ data: result })
    },
  )

  // POST /pendientes/:diffId/transferencia — marcar como transferencia.
  app.post<{ Params: { diffId: string } }>(
    '/pendientes/:diffId/transferencia',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const user = request.user as { id: string }
      const result = await transferenciaParaIdSialService(request.params.diffId, user.id)
      return reply.send({ data: result })
    },
  )

  // POST /pendientes/:diffId/sin-codigo — dejar sin código (rechazar).
  app.post<{ Params: { diffId: string } }>(
    '/pendientes/:diffId/sin-codigo',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'gestionar' }) },
    async (request, reply) => {
      const result = await sinCodigoParaIdSialService(request.params.diffId)
      return reply.send({ data: result })
    },
  )
  // ─── Pestañas de monitoreo (solo lectura; el gating por tab:* es de UI) ───
  // GET /baja-sin-concurso — cargos sin ocupante, sin concurso activo, detectados
  // en la baja SIAL semanal o ausentes del padrón.
  app.get(
    '/baja-sin-concurso',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const { refrescar, ...filtros } = bajaSinConcursoQuerySchema.parse(request.query)
      const result = await listarBajaSinConcurso(
        { ...filtros, page: filtros.page ?? 1, pageSize: filtros.pageSize ?? 50 },
        { refrescar },
      )
      return reply.send({ data: result })
    },
  )
  // GET /todo — unión de los tipos de incidencia.
  app.get(
    '/todo',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const { refrescar, ...filtros } = todoQuerySchema.parse(request.query)
      const result = await listarTodo(
        { ...filtros, page: filtros.page ?? 1, pageSize: filtros.pageSize ?? 50 },
        undefined,
        { refrescar },
      )
      return reply.send({ data: result })
    },
  )
  // ─── Pestañas persistidas (FASE 4, solo lectura desde padron_incidencias) ──
  // GET /cayo-del-padron | /cambio-situacion-revista | /cambios-del-puesto |
  // /otras — leen las incidencias que el paso 12 ya persistió en el último
  // snapshot aprobado. 'otras' agrupa los tres slugs 'otras:*'. Mismo gating
  // que el resto: `incidencias/ver`.
  for (const slug of ['cayo-del-padron', 'cambio-situacion-revista', 'cambios-del-puesto', 'otras'] as const) {
    app.get(
      `/${slug}`,
      { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'ver' }) },
      async (request, reply) => {
        const filtros = persistidaQuerySchema.parse(request.query)
        const result = await listarPersistidas(slug, {
          q: filtros.q,
          carrera: filtros.carrera,
          page: filtros.page ?? 1,
          pageSize: filtros.pageSize ?? 50,
        })
        return reply.send({ data: result })
      },
    )
  }
  // GET /resumen — contadores por pestaña + conciliación de la dotación.
  app.get(
    '/resumen',
    { preHandler: requirePermiso({ modulo: 'incidencias', accion: 'ver' }) },
    async (request, reply) => {
      const { refrescar } = resumenQuerySchema.parse(request.query)
      const result = await resumenIncidencias({ refrescar })
      if (result.conciliacion.sumaGrupos !== result.conciliacion.totalCargos) {
        request.log.error(
          { sumaGrupos: result.conciliacion.sumaGrupos, totalCargos: result.conciliacion.totalCargos },
          'Incidencias: la suma de grupos no coincide con el total de cargos',
        )
      }
      return reply.send({ data: result })
    },
  )
}
