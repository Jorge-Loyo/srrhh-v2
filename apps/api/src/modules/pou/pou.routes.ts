import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { pouQuerySchema, pouCompararQuerySchema } from './pou.schema.js'
import { listPouPorSiglaService, listHospitalesPouService, compararPouService, reemplazarPouService } from './pou.service.js'

export async function pouRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20 MB

  // Lectura abierta a todos los roles autenticados — igual que en la app
  // vieja (POUDetalle/POUComparativa las tienen admin, editor, viewer y director).
  app.get('/hospitales', async (_request, reply) => {
    const items = await listHospitalesPouService()
    return reply.send({ data: items })
  })

  app.get('/comparar', async (request, reply) => {
    const { siglas } = pouCompararQuerySchema.parse(request.query)
    const data = await compararPouService(siglas)
    return reply.send({ data })
  })

  app.get('/', async (request, reply) => {
    const { sigla } = pouQuerySchema.parse(request.query)
    const data = await listPouPorSiglaService(sigla)
    return reply.send({ data })
  })

  // Módulo carga (solo admin): reemplaza toda la tabla `pou` desde un Excel.
  // Destructivo — igual criterio que /organigrama/upload.
  app.post(
    '/upload',
    { preHandler: requirePermiso({ modulo: 'configuracion', accion: 'gestionar_pou' }) },
    async (request, reply) => {
      const parts = request.parts()
      let uploadedFile: { buffer: Buffer } | null = null
      for await (const part of parts) {
        if (part.type === 'file') {
          uploadedFile = { buffer: await part.toBuffer() }
        }
      }
      if (!uploadedFile) throw AppError.badRequest('Archivo requerido')

      const result = await reemplazarPouService(uploadedFile.buffer)
      return reply.send({ data: result })
    }
  )
}
