import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const s = await p.solicitudAlta.findFirst({
  where: { expediente: { contains: 'LUCASPRUEBACARGOS' } },
  select: {
    id: true, expediente: true, estado: true, cargosCreadosIds: true,
    etiquetas: { select: { etiqueta: { select: { id: true, nombre: true } } } },
  },
})
console.log(JSON.stringify(s, null, 2))

// Ver si los cargos tienen etiquetas en EtiquetaCargo
if (s?.cargosCreadosIds?.length) {
  const ec = await p.etiquetaCargo.findMany({
    where: { cargoId: { in: s.cargosCreadosIds } },
    select: { cargoId: true, etiqueta: { select: { nombre: true } } },
  })
  console.log('EtiquetaCargo rows:', ec.length, ec.slice(0, 3))
}
await p.$disconnect()
