import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

// Necesario para los selectores de filtro de PersonasPage/CargosPage (S3-3/S3-8)
// — no existía ningún endpoint de escalafones todavía, solo hospitales.
export async function escalafonesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_request, reply) => {
    const escalafones = await prisma.escalafon.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    })
    return reply.send({ data: escalafones })
  })
}
