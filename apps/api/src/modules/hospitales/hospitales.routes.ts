import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

export async function hospitalesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_request, reply) => {
    const hospitales = await prisma.hospital.findMany({
      where: { activo: true },
      orderBy: { sigla: 'asc' },
    })
    return reply.send({ data: hospitales })
  })
}
