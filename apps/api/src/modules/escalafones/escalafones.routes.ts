import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

// Necesario para los selectores de filtro de PersonasPage/CargosPage (S3-3/S3-8)
// — no existía ningún endpoint de escalafones todavía, solo hospitales.
export async function escalafonesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    const { paraNuevaAlta } = request.query as { paraNuevaAlta?: string }

    // paraNuevaAlta=true: escalafones con puestos_cargo (para el formulario de alta)
    // default: escalafones con cargos reales (para filtros de búsqueda)
    const escalafones = await prisma.escalafon.findMany({
      where: {
        activo: true,
        ...(paraNuevaAlta === 'true'
          ? { puestosCargo: { some: { activo: true } } }
          : { cargos: { some: {} } }
        ),
      },
      orderBy: { nombre: 'asc' },
    })
    return reply.send({ data: escalafones })
  })
}
