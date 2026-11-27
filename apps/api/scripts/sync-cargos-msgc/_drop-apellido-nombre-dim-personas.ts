import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_personas DROP COLUMN IF EXISTS apellido, DROP COLUMN IF EXISTS nombre
  `)
  console.log('✓ Columnas apellido y nombre eliminadas de dim_personas')
}

main().catch(console.error).finally(() => prisma.$disconnect())
