import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import {
  concursosCphQuerySchema,
  patchConcursoCphSchema,
  suspenderConcursoCphSchema,
  designarCphSchema,
  declararDesiertoSchema,
  generarSorteoJuradoSchema,
} from './concursos-cph.schema.js'
import {
  listConcursosCphService,
  getConcursoCphByIdService,
  patchConcursoCphService,
  suspenderConcursoCphService,
  getPersonaDesignadaService,
  designarConcursoCphService,
  declararDesiertoService,
  importarConcursosCsvService,
} from './concursos-cph.service.js'
import {
  generarSorteoJuradoService,
  getJuradoVigenteService,
  confirmarSorteoService,
  cancelarSorteoService,
  revertirConfirmacionSorteoService,
  listJuradosVigentesService,
  asignarJuradoExistenteService,
} from './sorteoJurado.service.js'
import {
  inscriptoSchema,
  inscriptoPatchSchema,
  publicarInscripcionSchema,
  publicarExamenSchema,
} from './inscriptos.schema.js'
import {
  listInscriptosService,
  createInscriptoService,
  updateInscriptoService,
  deleteInscriptoService,
  importarInscriptosService,
  cerrarInscripcionService,
  reabrirInscripcionService,
  publicarExamenService,
  despublicarExamenService,
  confirmarPresentadosService,
  revertirPresentadosService,
  confirmarOrdenMeritoService,
  revertirOrdenMeritoService,
  listOrdenesMeritoVigentesService,
} from './inscriptos.service.js'

// Escritura: permiso concursos-cph.editar (ver /configuracion/permisos — por defecto
// admin/editor/concursales_cph, editable en caliente). Lectura: cualquier autenticado.
const WRITE_PERMISO = { modulo: 'concursos-cph', accion: 'editar' }

export async function concursosCphRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  app.addHook('preHandler', authenticate)

  // POST /importar-csv — actualizar concursos CPH desde CSV semanal
  app.post(
    '/importar-csv',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await request.file()
      if (!data) throw new Error('Archivo requerido')
      const buffer = await data.toBuffer()
      const result = await importarConcursosCsvService(buffer)
      return reply.send({ data: result })
    },
  )

  // GET / — S4-1: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = concursosCphQuerySchema.parse(request.query)
    const result = await listConcursosCphService(query)
    return reply.send(result)
  })

  // GET /jurados-vigentes — jurados confirmados vigentes (6 meses) reutilizables.
  // Debe ir ANTES de /:id para no ser capturada por la ruta paramétrica.
  app.get('/jurados-vigentes', async (_request, reply) => {
    const data = await listJuradosVigentesService()
    return reply.send({ data })
  })

  // GET /ordenes-merito-vigentes — órdenes de mérito vigentes con integrantes
  // disponibles (no designados, no anulados). Antes de /:id.
  app.get('/ordenes-merito-vigentes', async (_request, reply) => {
    const data = await listOrdenesMeritoVigentesService()
    return reply.send({ data })
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
    },
  )

  // POST /:id/suspender — S4-5
  app.post<{ Params: { id: string } }>(
    '/:id/suspender',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = suspenderConcursoCphSchema.parse(request.body ?? {})
      const data = await suspenderConcursoCphService(request.params.id, body)
      return reply.send({ data })
    },
  )

  // GET /:id/persona-designada — busca la persona designada por personaDesignadaId
  // o por OrdenMeritoIntegrante.designado=true para este concurso
  app.get<{ Params: { id: string } }>('/:id/persona-designada', async (request, reply) => {
    const data = await getPersonaDesignadaService(request.params.id)
    return reply.send({ data })
  })

  // POST /:id/designar — S16-1: registra la designación, crea Ocupacion, avanza a N-DESIGNADO
  app.post<{ Params: { id: string } }>(
    '/:id/designar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = designarCphSchema.parse(request.body)
      const data = await designarConcursoCphService(request.params.id, body)
      return reply.send({ data })
    },
  )

  // POST /:id/declarar-desierto — PS16D-3
  app.post<{ Params: { id: string } }>(
    '/:id/declarar-desierto',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = declararDesiertoSchema.parse(request.body)
      const data = await declararDesiertoService(request.params.id, body, (request as any).user.id)
      return reply.send({ data })
    },
  )

  // GET /:id/jurado — Etapa 2: acta del último sorteo de jurado (o null)
  app.get<{ Params: { id: string } }>('/:id/jurado', async (request, reply) => {
    const data = await getJuradoVigenteService(request.params.id)
    return reply.send({ data })
  })

  // POST /:id/generar-sorteo — Etapa 2: sortea el jurado según criterios,
  // guarda el acta + miembros y setea la fecha de sorteo en el concurso.
  app.post<{ Params: { id: string } }>(
    '/:id/generar-sorteo',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = generarSorteoJuradoSchema.parse(request.body)
      const data = await generarSorteoJuradoService(
        request.params.id,
        body,
        (request as any).user?.id ?? null,
      )
      return reply.send({ data })
    },
  )

  // POST /:id/jurado/reutilizar — copia un jurado vigente compatible como
  // acta borrador del concurso (alternativa a sortear uno nuevo).
  app.post<{ Params: { id: string }; Body: { sorteoJuradoOrigenId?: string } }>(
    '/:id/jurado/reutilizar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const origenId = request.body?.sorteoJuradoOrigenId
      if (!origenId) throw new Error('sorteoJuradoOrigenId requerido')
      const data = await asignarJuradoExistenteService(
        request.params.id,
        origenId,
        (request as any).user?.id ?? null,
      )
      return reply.send({ data })
    },
  )

  // POST /:id/jurado/confirmar — fija el acta (queda de solo lectura)
  app.post<{ Params: { id: string } }>(
    '/:id/jurado/confirmar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await confirmarSorteoService(
        request.params.id,
        (request as any).user?.id ?? null,
      )
      return reply.send({ data })
    },
  )

  // ── Etapa 3: inscriptos al concurso ──────────────────────────────────────
  // GET /:id/inscriptos — lista de inscriptos
  app.get<{ Params: { id: string } }>('/:id/inscriptos', async (request, reply) => {
    const data = await listInscriptosService(request.params.id)
    return reply.send({ data })
  })

  // POST /:id/inscriptos — alta manual de un inscripto
  app.post<{ Params: { id: string } }>(
    '/:id/inscriptos',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = inscriptoSchema.parse(request.body)
      const data = await createInscriptoService(request.params.id, body)
      return reply.send({ data })
    },
  )

  // PATCH /:id/inscriptos/:inscriptoId — editar un inscripto
  app.patch<{ Params: { id: string; inscriptoId: string } }>(
    '/:id/inscriptos/:inscriptoId',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = inscriptoPatchSchema.parse(request.body)
      const data = await updateInscriptoService(request.params.id, request.params.inscriptoId, body)
      return reply.send({ data })
    },
  )

  // DELETE /:id/inscriptos/:inscriptoId — baja de un inscripto
  app.delete<{ Params: { id: string; inscriptoId: string } }>(
    '/:id/inscriptos/:inscriptoId',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await deleteInscriptoService(request.params.id, request.params.inscriptoId)
      return reply.send({ data })
    },
  )

  // POST /:id/inscriptos/importar — importar inscriptos desde Excel/CSV
  app.post<{ Params: { id: string } }>(
    '/:id/inscriptos/importar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const file = await request.file()
      if (!file) throw new Error('Archivo requerido')
      const buffer = await file.toBuffer()
      const data = await importarInscriptosService(request.params.id, buffer)
      return reply.send({ data })
    },
  )

  // POST /:id/inscripciones/cerrar — publica las fechas de inscripción y cierra
  // el período (avanza a D). Acepta las fechas en el body para guardarlas.
  app.post<{ Params: { id: string } }>(
    '/:id/inscripciones/cerrar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = publicarInscripcionSchema.parse(request.body ?? {})
      const data = await cerrarInscripcionService(request.params.id, body)
      return reply.send({ data })
    },
  )

  // POST /:id/examen/publicar — guarda y publica la fecha de examen
  app.post<{ Params: { id: string } }>(
    '/:id/examen/publicar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = publicarExamenSchema.parse(request.body ?? {})
      const data = await publicarExamenService(request.params.id, body.fechaExamen ?? undefined)
      return reply.send({ data })
    },
  )

  // POST /:id/examen/despublicar — revierte la publicación del examen
  app.post<{ Params: { id: string } }>(
    '/:id/examen/despublicar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await despublicarExamenService(request.params.id)
      return reply.send({ data })
    },
  )

  // POST /:id/inscripciones/reabrir — reabre el período de inscripción
  app.post<{ Params: { id: string } }>(
    '/:id/inscripciones/reabrir',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await reabrirInscripcionService(request.params.id)
      return reply.send({ data })
    },
  )

  // POST /:id/presentados/confirmar — congela quién se presentó al examen
  app.post<{ Params: { id: string } }>(
    '/:id/presentados/confirmar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await confirmarPresentadosService(request.params.id)
      return reply.send({ data })
    },
  )

  // POST /:id/presentados/revertir
  app.post<{ Params: { id: string } }>(
    '/:id/presentados/revertir',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await revertirPresentadosService(request.params.id)
      return reply.send({ data })
    },
  )

  // POST /:id/orden-merito/confirmar — fija la OM (fecha=hoy, avanza a E)
  app.post<{ Params: { id: string } }>(
    '/:id/orden-merito/confirmar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await confirmarOrdenMeritoService(request.params.id)
      return reply.send({ data })
    },
  )

  // POST /:id/orden-merito/revertir
  app.post<{ Params: { id: string } }>(
    '/:id/orden-merito/revertir',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await revertirOrdenMeritoService(request.params.id)
      return reply.send({ data })
    },
  )

  // POST /:id/jurado/revertir — revierte la confirmación (vuelve a borrador)
  app.post<{ Params: { id: string } }>(
    '/:id/jurado/revertir',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await revertirConfirmacionSorteoService(request.params.id)
      return reply.send({ data })
    },
  )

  // DELETE /:id/jurado — cancela (descarta) el sorteo vigente NO confirmado
  app.delete<{ Params: { id: string } }>(
    '/:id/jurado',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const data = await cancelarSorteoService(request.params.id)
      return reply.send({ data })
    },
  )

  // NOTA S13-C: POST /:id/autorizar (aprobar/rechazar modificación CPH) se
  // eliminó — nunca actualizaba la tabla `autorizaciones` genérica (dejaba
  // filas huérfanas en "pendiente"). Reemplazado por
  // POST /api/v1/autorizaciones/:id/aprobar|rechazar (autorizaciones.routes.ts).
}
