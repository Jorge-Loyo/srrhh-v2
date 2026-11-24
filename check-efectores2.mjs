import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const r = await prisma.dimEfectores.findMany({ select: { sigla: true, nombre: true }, orderBy: { sigla: 'asc' } })
console.log('Total:', r.length)
r.forEach(e => console.log(e.sigla.padEnd(10), e.nombre))
await prisma.$disconnect()
