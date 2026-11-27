import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const n = await prisma.$executeRawUnsafe(
    `UPDATE dim_personas SET sexo = 'm' WHERE cuil = '20415580097'`
  )
  console.log(`✓ dotti, octavio → sexo=m: ${n} fila`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
