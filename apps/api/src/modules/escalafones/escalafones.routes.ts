import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

// S3-6/S3-8 (Agustin): faltaba un endpoint para listar escalafones — hospitales.routes.ts
// ya tenía su equivalente, este lo espeja para poder poblar el dropdown de filtro de
// PersonasPage/CargosPage sin pedir a mano cada UUID de escalafón.
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
