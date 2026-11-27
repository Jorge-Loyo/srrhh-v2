import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const siglasSeed = [
  'ARGE','FERN','RAMO','ALVA','DURA','TORN','PIRO','PENN','ZUBI','RIVA',
  'PINE','SANT','DONA','ELIZ','GUTI','CARR','CURI','ROCC','MOYA','BORD',
  'LAGL','QUEM','SARD','VELE','GARR','CETR','PARO','MELE','ANEI','FIOR',
]

const efectores = await prisma.dimEfectores.findMany({
  where: { sigla: { in: siglasSeed } },
  select: { sigla: true, nombre: true },
})

const encontradas = new Set(efectores.map(e => e.sigla))
const faltantes = siglasSeed.filter(s => !encontradas.has(s))

console.log('Encontradas:', encontradas.size, '/', siglasSeed.length)
console.log('Faltantes:', faltantes)
if (efectores.length) {
  console.log('\nEjemplos encontrados:')
  efectores.slice(0, 5).forEach(e => console.log(' ', e.sigla, '-', e.nombre))
}

await prisma.$disconnect()
