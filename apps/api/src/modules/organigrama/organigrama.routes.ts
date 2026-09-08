import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { organigramaQuerySchema } from './organigrama.schema.js'
import { getOrganigramaService, reemplazarOrganigramaService } from './organigrama.service.js'

export async function organigramaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20 MB

  // Sin permiso especial: en la app vieja el organigrama es de lectura abierta
  // a todos los roles (admin, editor, viewer, director) — alcanza con estar
  // autenticado, igual que /hospitales o /escalafones.
  app.get('/', async (request, reply) => {
    const query = organigramaQuerySchema.parse(request.query)
    const result = await getOrganigramaService(query)
    return reply.send(result)
  })

  // Módulo "Árbol" (solo admin): reemplaza toda la estructura desde un Excel.
  // A diferencia del GET de arriba, esto SÍ requiere permiso — es destructivo
  // (borra y recarga la tabla entera).
  app.post(
    '/upload',
    { preHandler: requirePermiso({ modulo: 'configuracion', accion: 'gestionar_organigrama' }) },
    async (request, reply) => {
      const parts = request.parts()
      let uploadedFile: { buffer: Buffer } | null = null
      for await (const part of parts) {
        // Mismo cuidado que padron.routes.ts: hay que consumir el stream del
        // part 'file' DENTRO de este for-await (con toBuffer()), si no el
        // parser interno de busboy se queda esperando y el for-await nunca
        // termina de iterar.
        if (part.type === 'file') {
          uploadedFile = { buffer: await part.toBuffer() }
        }
      }
      if (!uploadedFile) throw AppError.badRequest('Archivo requerido')

      const result = await reemplazarOrganigramaService(uploadedFile.buffer)
      return reply.send({ data: result })
    }
  )
}
