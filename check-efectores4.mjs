import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const r = await prisma.dimEfectores.findMany({
  select: { sigla: true, nombre: true, nombreCompleto: true, tipo: true },
  orderBy: { sigla: 'asc' },
})
console.log('Total efectores:', r.length)
r.forEach(e => console.log(
  e.sigla.padEnd(14),
  (e.tipo ?? '').padEnd(12),
  (e.nombreCompleto ?? e.nombre ?? '').substring(0, 60)
))
await prisma.$disconnect()
