import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { AppError } from '../../shared/errors/AppError.js'
import { uploadPadronSchema, diffQuerySchema } from './padron.schema.js'
import {
  uploadPadronService,
  listSnapshotsService,
  getSnapshotDiffService,
  aprobarSnapshotService,
  rechazarSnapshotService,
} from './padron.service.js'

export async function padronRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }) // 50 MB

  app.addHook('preHandler', authenticate)

  // GET /snapshots — listar todos los snapshots
  app.get('/snapshots', async (_request, reply) => {
    const snapshots = await listSnapshotsService()
    return reply.send({ data: snapshots })
  })

  // POST /upload — S2-2/S2-3/S2-4/S2-12 (requiere editor o admin)
  app.post('/upload', { preHandler: requireRole([RolUsuario.ADMIN, RolUsuario.EDITOR]) }, async (request, reply) => {
    const parts = request.parts()
    let fechaAsignada = ''
    let file: Awaited<ReturnType<typeof request.file>> | null = null

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'fechaAsignada') {
        fechaAsignada = part.value as string
      } else if (part.type === 'file') {
        file = part
      }
    }

    if (!file) throw AppError.badRequest('Archivo requerido')

    const { fechaAsignada: fecha } = uploadPadronSchema.parse({ fechaAsignada })
    const user = request.user as { id: string }
    const result = await uploadPadronService(file, fecha, user.id)

    return reply.status(202).send({ data: result })
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
  app.post<{ Params: { id: string } }>('/snapshots/:id/aprobar', { preHandler: requireRole([RolUsuario.ADMIN, RolUsuario.EDITOR]) }, async (request, reply) => {
    const user = request.user as { id: string }
    const result = await aprobarSnapshotService(request.params.id, user.id)
    return reply.send({ data: result })
  })

  // POST /snapshots/:id/rechazar — S2-8 (requiere editor o admin)
  app.post<{ Params: { id: string } }>('/snapshots/:id/rechazar', { preHandler: requireRole([RolUsuario.ADMIN, RolUsuario.EDITOR]) }, async (request, reply) => {
    const result = await rechazarSnapshotService(request.params.id)
    return reply.send({ data: result })
  })
}
