import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { organigramaQuerySchema } from './organigrama.schema.js'
import { getOrganigramaService, reemplazarOrganigramaService, listOrganigramaUploadsService, listSiglasOrganigramaService, getVacantesConduccionService, getCargosConduccionHuerfanosService, exportOrganigramaExcelService } from './organigrama.service.js'

export async function organigramaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20 MB

  app.get('/', async (request, reply) => {
    const query = organigramaQuerySchema.parse(request.query)
    const result = await getOrganigramaService(query)
    return reply.send(result)
  })

  // Lista de siglas con nodos en el organigrama (para el selector de alta de
  // estructura). Incluye las secciones fijas nivel-central y atencion-primaria.
  app.get('/siglas', async (_request, reply) => {
    const data = await listSiglasOrganigramaService()
    return reply.send({ data })
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

  // Export Excel del organigrama de un hospital por sigla.
  app.get('/export-excel', async (request, reply) => {
    const q = request.query as { sigla?: string }
    if (!q.sigla || !/^[A-Za-z0-9]{2,10}$/.test(q.sigla)) {
      return reply.status(400).send({ error: 'Se requiere sigla válida' })
    }
    const sigla = q.sigla.toUpperCase()
    const buffer = await exportOrganigramaExcelService(sigla)
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="organigrama_${sigla}.xlsx"`)
      .send(buffer)
  })

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
