import type { FastifyInstance } from 'fastify'
import { loginSchema } from './auth.schema.js'
import { loginService } from './auth.service.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const result = await loginService(body, (payload) => app.jwt.sign(payload))
    return reply.send({ data: result })
  })

  app.post('/logout', async (_request, reply) => {
    // TODO: revocar refresh token
    return reply.send({ data: { ok: true } })
  })
}
