import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { AppError } from '../../shared/errors/AppError.js'
import { uploadBajasSialSchema, diffQuerySchema } from './bajas-sial.schema.js'
import {
  uploadBajasSialService,
  listBajasSialSnapshotsService,
  getBajasSialEstadoService,
  getBajasSialDiffService,
  aprobarBajasSialService,
  rechazarBajasSialService,
  listBajasSialRegistrosService,
} from './bajas-sial.service.js'

export async function bajasSialRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })
  app.addHook('preHandler', authenticate)

  // GET /snapshots
  app.get('/snapshots', async (_req, reply) => {
    const data = await listBajasSialSnapshotsService()
    return reply.send({ data })
  })

  // POST /upload
  app.post('/upload', { preHandler: requireRole([RolUsuario.ADMIN, RolUsuario.EDITOR]) }, async (request, reply) => {
    const parts = request.parts()
    let fechaArchivo = ''
    let uploadedFile: { buffer: Buffer; filename: string } | null = null

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'fechaArchivo') {
        fechaArchivo = part.value as string
      } else if (part.type === 'file') {
        uploadedFile = { buffer: await part.toBuffer(), filename: part.filename }
      }
    }

    if (!uploadedFile) throw AppError.badRequest('Archivo requerido')
    const { fechaArchivo: fecha } = uploadBajasSialSchema.parse({ fechaArchivo })
    const user = request.user as { id: string }
    const result = await uploadBajasSialService(uploadedFile, fecha, user.id)
    return reply.status(202).send({ data: result })
  })

  // GET /snapshots/:id/estado
  app.get<{ Params: { id: string } }>('/snapshots/:id/estado', async (request, reply) => {
    const data = await getBajasSialEstadoService(request.params.id)
    return reply.send({ data })
  })

  // GET /snapshots/:id/diff
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/snapshots/:id/diff', async (request, reply) => {
      const query = diffQuerySchema.parse(request.query)
      const data = await getBajasSialDiffService(request.params.id, query)
      return reply.send({ data })
    }
  )

  // POST /snapshots/:id/aprobar
  app.post<{ Params: { id: string } }>('/snapshots/:id/aprobar',
    { preHandler: requireRole([RolUsuario.ADMIN, RolUsuario.EDITOR]) },
    async (request, reply) => {
      const user = request.user as { id: string }
      const data = await aprobarBajasSialService(request.params.id, user.id)
      return reply.send({ data })
    }
  )

  // POST /snapshots/:id/rechazar
  app.post<{ Params: { id: string } }>('/snapshots/:id/rechazar',
    { preHandler: requireRole([RolUsuario.ADMIN, RolUsuario.EDITOR]) },
    async (request, reply) => {
      const data = await rechazarBajasSialService(request.params.id)
      return reply.send({ data })
    }
  )

  // GET /registros — último snapshot aprobado (para /bajas)
  app.get<{ Querystring: Record<string, string> }>('/registros', async (request, reply) => {
    const { page = '1', limit = '50', search, motivo } = request.query
    const data = await listBajasSialRegistrosService({
      page: Number(page), limit: Number(limit), search, motivo,
    })
    return reply.send({ data })
  })
}
