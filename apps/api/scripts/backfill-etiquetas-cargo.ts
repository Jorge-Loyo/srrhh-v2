/**
 * Backfill: propaga las etiquetas de SolicitudAlta a los cargos creados.
 * Cubre altas aprobadas antes de que la aprobación copiara etiquetas a EtiquetaCargo.
 * Idempotente: usa skipDuplicates.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const solicitudes = await prisma.solicitudAlta.findMany({
  where: { estado: 'aprobada', etiquetas: { some: {} } },
  select: { id: true, cargosCreadosIds: true, etiquetas: { select: { etiquetaId: true } } },
})

console.log(`Solicitudes con etiquetas: ${solicitudes.length}`)

let creadas = 0
for (const s of solicitudes) {
  if (s.cargosCreadosIds.length === 0) continue
  const data = s.cargosCreadosIds.flatMap((cargoId) =>
    s.etiquetas.map(({ etiquetaId }) => ({ etiquetaId, cargoId })),
  )
  const r = await prisma.etiquetaCargo.createMany({ data, skipDuplicates: true })
  creadas += r.count
}

console.log(`Filas EtiquetaCargo creadas: ${creadas}`)
await prisma.$disconnect()
