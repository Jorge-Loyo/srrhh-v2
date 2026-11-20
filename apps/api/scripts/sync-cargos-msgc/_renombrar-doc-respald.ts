import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos RENAME COLUMN doc_respald TO doc_respald_alta
  `)
  console.log('✓ Columna renombrada: doc_respald → doc_respald_alta')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
