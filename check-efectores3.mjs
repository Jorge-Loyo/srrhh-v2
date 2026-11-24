import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const r = await prisma.dimEfectores.findMany({
  select: { sigla: true, nombre: true, nombreCompleto: true },
  where: { tipo: { in: ['hospital', 'Hospital', 'HOSPITAL'] } },
  orderBy: { sigla: 'asc' },
})
console.log('Hospitales en dim_efectores:', r.length)
r.forEach(e => console.log(e.sigla.padEnd(12), (e.nombreCompleto ?? e.nombre ?? '').substring(0, 60)))
await prisma.$disconnect()
