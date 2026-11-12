import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { updatePerfilSchema, changePasswordSchema } from './perfil.schema.js'
import { getPerfil, updatePerfil, changePasswordPerfil } from './perfil.service.js'

// Perfil del usuario ACTUAL. Sin `requirePermiso`: el usuario opera sobre sí
// mismo (identificado por request.user.id), no sobre otros usuarios.
export async function perfilRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    const requestingUser = request.user as { id: string }
    const perfil = await getPerfil(requestingUser.id)
    return reply.send({ data: perfil })
  })

  app.patch('/', async (request, reply) => {
    const requestingUser = request.user as { id: string }
    const body = updatePerfilSchema.parse(request.body)
    const perfil = await updatePerfil(requestingUser.id, body)
    return reply.send({ data: perfil })
  })

  // El path termina en `/password` → el audit middleware lo etiqueta
  // `cambiar_password` y enmascara el body (claves con substring `password`).
  app.patch('/password', async (request, reply) => {
    const requestingUser = request.user as { id: string }
    const body = changePasswordSchema.parse(request.body)
    const result = await changePasswordPerfil(requestingUser.id, {
      passwordActual: body.passwordActual,
      passwordNueva: body.passwordNueva,
    })
    return reply.send({ data: result })
  })
}
