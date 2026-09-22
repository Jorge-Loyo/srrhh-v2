import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

interface PuestoRow {
  puesto: string
  especialidades: string[]
}

const puestosQuerySchema = z.object({
  // Pedido de Jorge (2026-08-26): filtro en cascada — con un escalafón
  // elegido en PersonasPage, el dropdown de puesto solo debe ofrecer los
  // puestos que realmente existen en ESE escalafón.
  escalafonId: z.string().uuid().optional(),
})

// Filtro por puesto + especialidad en cascada de PersonasPage: cada puesto
// trae la lista de especialidades reales que aparecen en cargos con ese
// puesto (puede ser [] — la mayoría de los puestos no médicos nunca tienen
// especialidad, ej. "Licenciado en Enfermería" vs "Médico de Planta").
// `literalPuesto` es texto libre en Cargo (sin catálogo/FK, decisión de
// diseño de Sprint 2 — ver PLAN_SCRUM_2026.md), cargado desde el padrón SIAL
// y desde el alta manual de cargos sin normalizar mayúsculas/espacios, por
// lo que el mismo puesto puede existir con distinto casing ("Enfermero" /
// "ENFERMERO"). Se agrupa por LOWER(TRIM(...)) para no repetir esas
// variantes en el dropdown, mostrando una versión Title Case como label.
// El filtro real contra personas (personas.service.ts) compara con la misma
// normalización, así que cualquiera de las variantes originales sigue
// matcheando. `especialidad_legacy` tiene el mismo problema de texto libre
// sin normalizar, así que se dedupea/normaliza igual dentro del array_agg.
export async function puestosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (request, reply) => {
    const { escalafonId } = puestosQuerySchema.parse(request.query)
    const puestos = await prisma.$queryRaw<PuestoRow[]>(Prisma.sql`
      SELECT
        MIN(INITCAP(TRIM(literal_puesto))) AS puesto,
        array_remove(array_agg(DISTINCT NULLIF(INITCAP(TRIM(especialidad_legacy)), '')), NULL) AS especialidades
      FROM cargos
      WHERE literal_puesto IS NOT NULL
      ${escalafonId ? Prisma.sql`AND escalafon_id = ${escalafonId}::uuid` : Prisma.empty}
      GROUP BY LOWER(TRIM(literal_puesto))
      ORDER BY puesto ASC
    `)
    return reply.send({ data: puestos })
  })
}
