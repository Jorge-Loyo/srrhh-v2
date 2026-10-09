import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { organigramaQuerySchema } from './organigrama.schema.js'
import { getOrganigramaService, reemplazarOrganigramaService, listOrganigramaUploadsService, getVacantesConduccionService, getCargosConduccionHuerfanosService } from './organigrama.service.js'

export async function organigramaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20 MB

  app.get('/', async (request, reply) => {
    const query = organigramaQuerySchema.parse(request.query)
    const result = await getOrganigramaService(query)
    return reply.send(result)
  })

  // S24-9: KPI y listado de vacantes de conducción (jefaturas sin ocupante
  // activo). Query opcional `sigla` para acotar a un efector.
  app.get('/vacantes', async (request, reply) => {
    const q = request.query as { sigla?: string; escalafon?: string } | undefined
    const result = await getVacantesConduccionService({ sigla: q?.sigla, escalafon: q?.escalafon })
    return reply.send({ data: result })
  })

  // S24-7 (complemento): cargos de conducción huérfanos (nodo eliminado del
  // árbol). Para que RRHH decida darlos de baja o conservarlos. Solo gestión.
  app.get(
    '/cargos-huerfanos',
    { preHandler: requirePermiso({ modulo: 'configuracion', accion: 'gestionar_organigrama' }) },
    async (_request, reply) => {
      const result = await getCargosConduccionHuerfanosService()
      return reply.send({ data: result })
    }
  )

  app.post(
    '/upload',
    { preHandler: requirePermiso({ modulo: 'configuracion', accion: 'gestionar_organigrama' }) },
    async (request, reply) => {
      const parts = request.parts()
      let uploadedFile: { buffer: Buffer; filename: string } | null = null
      for await (const part of parts) {
        if (part.type === 'file') {
          uploadedFile = { buffer: await part.toBuffer(), filename: part.filename }
        }
      }
      if (!uploadedFile) throw AppError.badRequest('Archivo requerido')

      const usuarioId = (request as any).user?.id as string | undefined
      const result = await reemplazarOrganigramaService(uploadedFile.buffer, usuarioId, uploadedFile.filename)
      return reply.send({ data: result })
    }
  )

  app.get(
    '/uploads',
    { preHandler: requirePermiso({ modulo: 'configuracion', accion: 'gestionar_organigrama' }) },
    async (_request, reply) => {
      const uploads = await listOrganigramaUploadsService()
      return reply.send({ data: uploads })
    }
  )
}
