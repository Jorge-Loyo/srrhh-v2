import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

export async function codigosRegistroRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_request, reply) => {
    const codigos = await prisma.codigoRegistro.findMany({
      orderBy: { literal: 'asc' },
    })
    return reply.send({ data: codigos })
  })
}
