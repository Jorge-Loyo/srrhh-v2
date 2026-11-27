import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { corregirTipoSchema } from '../concursos/corregirTipo.schema.js'
import { corregirTipoConcursoService } from '../concursos/corregirTipo.service.js'
import { concursosCeetpsQuerySchema, patchConcursoCeetpsSchema, designarCeetpsSchema, asignarDesignadoCeetpsSchema } from './concursos-ceetps.schema.js'
import {
  listConcursosCeetpsService,
  getConcursoCeetpsByIdService,
  patchConcursoCeetpsService,
  designarConcursoCeetpsService,
  asignarDesignadoCeetpsService,
  registrarNoAptoCeetpsService,
  listarHistorialDesignacionCeetpsService,
} from './concursos-ceetps.service.js'
import {
  documentacionInscriptosSchema,
  importarInscriptosSchema,
  inscriptoCeetpsPatchSchema,
  inscriptoCeetpsSchema,
} from './inscriptos.schema.js'
import {
  createInscriptoCeetpsService,
  deleteInscriptoCeetpsService,
  importarInscriptosCeetpsService,
  listInscriptosCeetpsService,
  marcarDocumentacionCeetpsService,
  updateInscriptoCeetpsService,
} from './inscriptos.service.js'
import { agregarMiembroJuradoSchema, cantidadesJuradoSchema } from './jurado.schema.js'
import {
  agregarMiembroJuradoService,
  getJuradoCeetpsService,
  quitarMiembroJuradoService,
  setCantidadesJuradoService,
} from './jurado.service.js'

const WRITE_PERMISO = { modulo: 'concursos-ceetps', accion: 'editar' }

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
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const usuarioId = (request as any).user?.id as string | undefined
      if (!usuarioId) throw AppError.unauthorized('Sesion requerida')
      const body = patchConcursoCeetpsSchema.parse(request.body)
      const data = await patchConcursoCeetpsService(request.params.id, body, usuarioId)
      return reply.send({ data })
    }
  )

  // POST /:id/corregir-tipo — Paso 5a: CEETPS -> CPH, solo quien autoriza (se valida en el service)
  app.post<{ Params: { id: string } }>('/:id/corregir-tipo', async (request, reply) => {
    const usuarioId = (request as any).user?.id as string | undefined
    if (!usuarioId) throw AppError.unauthorized('Sesion requerida')
    const body = corregirTipoSchema.parse(request.body)
    const data = await corregirTipoConcursoService('ceetps', request.params.id, body, usuarioId)
    return reply.send({ data })
  })
  // POST /:id/designar — S16-2: registra la designación, crea Ocupacion, avanza a finalizado
  app.post<{ Params: { id: string } }>(
    '/:id/designar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = designarCeetpsSchema.parse(request.body)
      const data = await designarConcursoCeetpsService(request.params.id, body)
      return reply.send({ data })
    }
  )

  // POST /:id/asignar-designado — vincula al designado (persona o referencia CUIL+nombre) SIN ocupar el cargo
  app.post<{ Params: { id: string } }>(
    '/:id/asignar-designado',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = asignarDesignadoCeetpsSchema.parse(request.body)
      const data = await asignarDesignadoCeetpsService(request.params.id, body)
      return reply.send({ data })
    }
  )

  // POST /:id/designacion/no-apto — el candidato no fue apto: guarda su historial y vuelve a la Etapa 4
  app.post<{ Params: { id: string } }>(
    '/:id/designacion/no-apto',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await registrarNoAptoCeetpsService(request.params.id)
      return reply.send({ data })
    }
  )

  // GET /:id/designacion/historial — candidatos anteriores que no fueron aptos
  app.get<{ Params: { id: string } }>('/:id/designacion/historial', async (request, reply) => {
    const data = await listarHistorialDesignacionCeetpsService(request.params.id)
    return reply.send({ data })
  })

  // ── Etapa 2: jurado (asignación manual, reemplaza el sorteo) ──────────────
  // GET /:id/jurado — lugares (titulares/suplentes) y miembros asignados
  app.get<{ Params: { id: string } }>('/:id/jurado', async (request, reply) => {
    const data = await getJuradoCeetpsService(request.params.id)
    return reply.send({ data })
  })

  // PUT /:id/jurado/cantidades — define los lugares (antes de asignar personas)
  app.put<{ Params: { id: string } }>(
    '/:id/jurado/cantidades',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = cantidadesJuradoSchema.parse(request.body)
      const data = await setCantidadesJuradoService(request.params.id, body)
      return reply.send({ data })
    }
  )

  // POST /:id/jurado/miembros — asigna una persona con cargo vigente
  app.post<{ Params: { id: string } }>(
    '/:id/jurado/miembros',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = agregarMiembroJuradoSchema.parse(request.body)
      const data = await agregarMiembroJuradoService(request.params.id, body)
      return reply.status(201).send({ data })
    }
  )

  // DELETE /:id/jurado/miembros/:miembroId — quita un miembro (renumera su rol)
  app.delete<{ Params: { id: string; miembroId: string } }>(
    '/:id/jurado/miembros/:miembroId',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await quitarMiembroJuradoService(request.params.id, request.params.miembroId)
      return reply.send({ data })
    }
  )

  // ── Etapa 3: inscriptos y pasos del concurso ─────────────────────────────
  // GET /:id/inscriptos — con los flags "pasa*" calculados contra los mínimos
  app.get<{ Params: { id: string } }>('/:id/inscriptos', async (request, reply) => {
    const data = await listInscriptosCeetpsService(request.params.id)
    return reply.send({ data })
  })

  // POST /:id/inscriptos/importar — importa un paso desde las filas de un Excel
  app.post<{ Params: { id: string } }>(
    '/:id/inscriptos/importar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = importarInscriptosSchema.parse(request.body)
      const data = await importarInscriptosCeetpsService(request.params.id, body)
      return reply.send({ data })
    }
  )

  // POST /:id/inscriptos/documentacion — "todos entregaron documentación"
  app.post<{ Params: { id: string } }>(
    '/:id/inscriptos/documentacion',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = documentacionInscriptosSchema.parse(request.body)
      const data = await marcarDocumentacionCeetpsService(request.params.id, body.entregoDocumentacion)
      return reply.send({ data })
    }
  )

  // POST /:id/inscriptos — alta manual
  app.post<{ Params: { id: string } }>(
    '/:id/inscriptos',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = inscriptoCeetpsSchema.parse(request.body)
      const data = await createInscriptoCeetpsService(request.params.id, body)
      return reply.status(201).send({ data })
    }
  )

  // PATCH /:id/inscriptos/:inscriptoId — editar cualquier paso (y el orden de mérito)
  app.patch<{ Params: { id: string; inscriptoId: string } }>(
    '/:id/inscriptos/:inscriptoId',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = inscriptoCeetpsPatchSchema.parse(request.body)
      const data = await updateInscriptoCeetpsService(
        request.params.id,
        request.params.inscriptoId,
        body
      )
      return reply.send({ data })
    }
  )

  // DELETE /:id/inscriptos/:inscriptoId — baja de un inscripto
  app.delete<{ Params: { id: string; inscriptoId: string } }>(
    '/:id/inscriptos/:inscriptoId',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      await deleteInscriptoCeetpsService(request.params.id, request.params.inscriptoId)
      return reply.status(204).send()
    }
  )
}
