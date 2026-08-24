import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { createUsuarioSchema } from './usuarios.schema.js'
import { listUsuarios, createUsuario, setUsuarioActivo } from './usuarios.service.js'

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireRole([RolUsuario.ADMIN]))

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
}
