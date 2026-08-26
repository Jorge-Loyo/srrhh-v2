import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

// Necesario para los selectores de filtro de PersonasPage/CargosPage (S3-3/S3-8)
// — no existía ningún endpoint de escalafones todavía, solo hospitales.
export async function escalafonesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (_request, reply) => {
    // Reportado (2026-08-25): el dropdown de filtro traía catálogo entero,
    // incluidos los 3 escalafones "genéricos" del seed (CPH/ENF/TEC — pensados
    // como categorías de concursos, no como valores reales de la columna
    // ESCALAFON del padrón) que nunca matchean ningún cargo real: el texto
    // exacto de esos 3 nunca aparece tal cual en los datos del Dotaneitor
    // (que usa "Médicos", "Escalafón General", "CEETPS", etc., creados on-the-fly
    // por aprobarSnapshotService). Filtrar a "al menos un cargo real" deja
    // solo lo que la columna ESCALAFON del padrón efectivamente produce.
    const escalafones = await prisma.escalafon.findMany({
      where: { activo: true, cargos: { some: {} } },
      orderBy: { nombre: 'asc' },
    })
    return reply.send({ data: escalafones })
  })
}
