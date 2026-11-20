import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE dim_puestos ALTER COLUMN efector TYPE VARCHAR(15)`)
  console.log('✓ efector → VARCHAR(15)')
}

main().catch(console.error).finally(() => prisma.$disconnect())
