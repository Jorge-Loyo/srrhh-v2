import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

interface PuestoRow {
  puesto: string
  especialidades: string[]
}

// Filtro por puesto + especialidad en cascada de PersonasPage: cada puesto
// trae la lista de especialidades reales que aparecen en cargos con ese
// puesto (puede ser [] — la mayoría de los puestos no médicos nunca tienen
// especialidad, ej. "Licenciado en Enfermería" vs "Médico de Planta").
// `literalPuesto` es texto libre en Cargo (sin catálogo/FK, decisión de
// diseño de Sprint 2 — ver PLAN_SCRUM_2026.md), así que se agrupa por valor
// distinto en vez de un join a una tabla de catálogo.
export async function puestosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_request, reply) => {
    const puestos = await prisma.$queryRaw<PuestoRow[]>`
      SELECT
        literal_puesto AS puesto,
        array_remove(array_agg(DISTINCT NULLIF(especialidad, '')), NULL) AS especialidades
      FROM cargos
      WHERE literal_puesto IS NOT NULL
      GROUP BY literal_puesto
      ORDER BY literal_puesto ASC
    `
    return reply.send({ data: puestos })
  })
}
