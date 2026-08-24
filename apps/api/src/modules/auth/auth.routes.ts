import type { FastifyInstance } from 'fastify'
import { loginSchema, refreshSchema } from './auth.schema.js'
import { loginService, refreshTokenService, logoutService } from './auth.service.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const result = await loginService(body, (payload) => app.jwt.sign(payload))
    return reply.send({ data: result })
  })

  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body)
    const result = await refreshTokenService(body, (payload) => app.jwt.sign(payload))
    return reply.send({ data: result })
  })

  app.post('/logout', async (request, reply) => {
    const body = refreshSchema.parse(request.body)
    await logoutService(body)
    return reply.send({ data: { ok: true } })
  })
}
