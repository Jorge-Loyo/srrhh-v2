import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos RENAME COLUMN escalafon TO lit_cod_reg
  `)
  console.log('✓ Columna renombrada: escalafon → lit_cod_reg en dim_puestos')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
