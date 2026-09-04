import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { z } from 'zod'
import { createUsuarioSchema } from './usuarios.schema.js'
import { listUsuarios, createUsuario, setUsuarioActivo, changePassword } from './usuarios.service.js'

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requirePermiso({ modulo: 'configuracion', accion: 'gestionar_usuarios' }))

  app.get('/', async (_request, reply) => {
    const usuarios = await listUsuarios()
    return reply.send({ data: usuarios })
  })

  app.post('/', async (request, reply) => {
    const body = createUsuarioSchema.parse(request.body)
    const usuario = await createUsuario(body)
    return reply.status(201).send({ data: usuario })
  })

  app.patch<{ Params: { id: string } }>('/:id/activar', async (request, reply) => {
    const requestingUser = request.user as { id: string }
    const usuario = await setUsuarioActivo(request.params.id, true, requestingUser.id)
    return reply.send({ data: usuario })
  })

  app.patch<{ Params: { id: string } }>('/:id/desactivar', async (request, reply) => {
    const requestingUser = request.user as { id: string }
    const usuario = await setUsuarioActivo(request.params.id, false, requestingUser.id)
    return reply.send({ data: usuario })
  })

  app.patch<{ Params: { id: string } }>('/:id/password', async (request, reply) => {
    const { password } = z.object({ password: z.string().min(8) }).parse(request.body)
    await changePassword(request.params.id, password)
    return reply.send({ ok: true })
  })
}
