import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

// Necesario para los selectores de filtro de PersonasPage/CargosPage (S3-3/S3-8)
// — no existía ningún endpoint de escalafones todavía, solo hospitales.
export async function escalafonesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    const { paraNuevaAlta, modalidad, tipoPuesto } = request.query as {
      paraNuevaAlta?: string
      modalidad?: string
      tipoPuesto?: string
    }

    // paraNuevaAlta=true: escalafones con puestos_cargo (para el formulario de alta)
    // modalidad + tipoPuesto: filtran los puestos_cargo que deben existir
    // default: escalafones con cargos reales (para filtros de búsqueda)
    const escalafones = await prisma.escalafon.findMany({
      where: {
        activo: true,
        ...(paraNuevaAlta === 'true'
          ? {
              puestosCargo: {
                some: {
                  activo: true,
                  ...(modalidad  && { modalidad:  modalidad  as 'pof' | 'pou' | 'ambos' }),
                  ...(tipoPuesto && { tipoPuesto: tipoPuesto as 'ejecucion' | 'conduccion' }),
                },
              },
            }
          : { cargos: { some: {} } }
        ),
      },
      orderBy: { nombre: 'asc' },
    })
    return reply.send({ data: escalafones })
  })
}
