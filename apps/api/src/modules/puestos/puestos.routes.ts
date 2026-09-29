import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

interface PuestoRow {
  id: string
  puesto: string
  especialidades: { id: string; nombre: string }[]
}

const puestosQuerySchema = z.object({
  // Pedido de Jorge (2026-08-26): filtro en cascada — con un escalafón
  // elegido en PersonasPage, el dropdown de puesto solo debe ofrecer los
  // puestos que realmente existen en ESE escalafón.
  escalafonId: z.string().uuid().optional(),
})

// S20-7: filtro por puesto + especialidad en cascada de PersonasPage — lee
// directo el catálogo PuestoCargo/EspecialidadPuesto por FK, ya no agrupa
// literal_puesto/especialidad_legacy de `cargos` con GROUP BY LOWER(TRIM(...)).
export async function puestosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    const { escalafonId } = puestosQuerySchema.parse(request.query)
    const puestos = await prisma.puestoCargo.findMany({
      where: { activo: true, ...(escalafonId && { escalafonId }) },
      select: { id: true, nombre: true, especialidades: { where: { activo: true }, select: { id: true, nombre: true } } },
      orderBy: { nombre: 'asc' },
    })
    const data: PuestoRow[] = puestos.map((p) => ({ id: p.id, puesto: p.nombre, especialidades: p.especialidades }))
    return reply.send({ data })
  })
}
