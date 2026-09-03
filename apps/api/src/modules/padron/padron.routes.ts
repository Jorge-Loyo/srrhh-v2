import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { uploadPadronSchema, diffQuerySchema } from './padron.schema.js'
import {
  uploadPadronService,
  listSnapshotsService,
  getSnapshotDiffService,
  getSnapshotEstadoService,
  aprobarSnapshotService,
  rechazarSnapshotService,
  deleteSnapshotService,
  exportarSnapshotService,
  cleanupSnapshotsProcesando,
  getConflictosValidacionService,
  aprobarDiffNuevoService,
  rechazarDiffNuevoService,
  aprobarTodosDiffsPendientesService,
} from './padron.service.js'

export async function padronRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }) // 50 MB

  app.addHook('preHandler', authenticate)

  // Cleanup al arrancar: snapshots que quedaron en procesando por reinicio
  await cleanupSnapshotsProcesando()

  // GET /snapshots — listar todos los snapshots
  app.get('/snapshots', async (_request, reply) => {
    const snapshots = await listSnapshotsService()
    return reply.send({ data: snapshots })
  })

  // POST /upload — S2-2/S2-3/S2-4/S2-12 (requiere editor o admin)
  app.post('/upload', { preHandler: requirePermiso({ modulo: 'padron', accion: 'subir' }) }, async (request, reply) => {
    const parts = request.parts()
    let fechaAsignada = ''
    let uploadedFile: { buffer: Buffer; filename: string; mimetype: string } | null = null

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'fechaAsignada') {
        fechaAsignada = part.value as string
      } else if (part.type === 'file') {
        // Hallazgo (verificación manual Sprint 2, 2026-08-25): si no se consume
        // el stream del part 'file' MIENTRAS está activo en este iterador, el
        // parser interno de busboy queda esperando que se drene para poder
        // avanzar al siguiente part — y como el archivo suele ser la última
        // parte del multipart, el `for await` nunca termina de iterar (deadlock
        // silencioso, la request queda colgada sin loggear error ni completar).
        // Por eso se resuelve el buffer acá mismo, no se guarda solo la
        // referencia del part para leerlo después.
        uploadedFile = { buffer: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype }
      }
    }

    if (!uploadedFile) throw AppError.badRequest('Archivo requerido')

    const { fechaAsignada: fecha } = uploadPadronSchema.parse({ fechaAsignada })
    const user = request.user as { id: string }
    const result = await uploadPadronService(uploadedFile, fecha, user.id)

    return reply.status(202).send({ data: result })
  })

  // GET /snapshots/:id/estado — S2-18: polling de estado del pipeline
  app.get<{ Params: { id: string } }>('/snapshots/:id/estado', async (request, reply) => {
    const result = await getSnapshotEstadoService(request.params.id)
    return reply.send({ data: result })
  })

  // GET /snapshots/:id/diff — S2-5
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/snapshots/:id/diff',
    async (request, reply) => {
      const query = diffQuerySchema.parse(request.query)
      const result = await getSnapshotDiffService(request.params.id, query)
      return reply.send({ data: result })
    }
  )

  // POST /snapshots/:id/aprobar — S2-6/S2-7 (requiere editor o admin)
  app.post<{ Params: { id: string } }>('/snapshots/:id/aprobar', { preHandler: requirePermiso({ modulo: 'padron', accion: 'aprobar_padron' }) }, async (request, reply) => {
    const user = request.user as { id: string }
    const result = await aprobarSnapshotService(request.params.id, user.id)
    return reply.send({ data: result })
  })

  // POST /snapshots/:id/rechazar — S2-8 (requiere editor o admin)
  app.post<{ Params: { id: string } }>('/snapshots/:id/rechazar', { preHandler: requirePermiso({ modulo: 'padron', accion: 'aprobar_padron' }) }, async (request, reply) => {
    const result = await rechazarSnapshotService(request.params.id)
    return reply.send({ data: result })
  })

  // GET /snapshots/:id/exportar — descargar Excel del Dotaneitor
  app.get<{ Params: { id: string } }>('/snapshots/:id/exportar', async (request, reply) => {
    const { stream, snapshotId } = await exportarSnapshotService(request.params.id)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="dotacion_${snapshotId.slice(0, 8)}.xlsx"`)
    return reply.send(stream)
  })

  // POST /snapshots/:id/diffs/aprobar-todos — aprobar todos los pendientes en bloque
  app.post<{ Params: { id: string } }>(
    '/snapshots/:id/diffs/aprobar-todos',
    { preHandler: requirePermiso({ modulo: 'padron', accion: 'aprobar_padron' }) },
    async (request, reply) => {
      const user = request.user as { id: string }
      const result = await aprobarTodosDiffsPendientesService(request.params.id, user.id)
      return reply.send({ data: result })
    }
  )

  // POST /snapshots/:id/diffs/:diffId/aprobar — aprobar un cargo nuevo individual
  app.post<{ Params: { id: string; diffId: string } }>(
    '/snapshots/:id/diffs/:diffId/aprobar',
    { preHandler: requirePermiso({ modulo: 'padron', accion: 'aprobar_padron' }) },
    async (request, reply) => {
      const user = request.user as { id: string }
      const result = await aprobarDiffNuevoService(request.params.id, request.params.diffId, user.id)
      return reply.send({ data: result })
    }
  )

  // POST /snapshots/:id/diffs/:diffId/rechazar — rechazar cargo nuevo (crea sin código)
  app.post<{ Params: { id: string; diffId: string } }>(
    '/snapshots/:id/diffs/:diffId/rechazar',
    { preHandler: requirePermiso({ modulo: 'padron', accion: 'aprobar_padron' }) },
    async (request, reply) => {
      const result = await rechazarDiffNuevoService(request.params.id, request.params.diffId)
      return reply.send({ data: result })
    }
  )

  // GET /snapshots/:id/conflictos-validacion — S8A-3
  app.get<{ Params: { id: string } }>('/snapshots/:id/conflictos-validacion', async (request, reply) => {
    const result = await getConflictosValidacionService(request.params.id)
    return reply.send({ data: result })
  })

  // DELETE /snapshots/:id — eliminar snapshot en estado error o rechazado (requiere admin)
  app.delete<{ Params: { id: string } }>('/snapshots/:id', { preHandler: requirePermiso({ modulo: 'padron', accion: 'eliminar_snap' }) }, async (request, reply) => {
    const result = await deleteSnapshotService(request.params.id)
    return reply.send({ data: result })
  })
}
