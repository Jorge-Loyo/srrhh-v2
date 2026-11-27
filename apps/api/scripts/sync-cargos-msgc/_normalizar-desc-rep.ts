import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const n = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos
    SET desc_rep = lower(unaccent(desc_rep))
    WHERE desc_rep IS NOT NULL
  `)
  console.log(`✓ desc_rep normalizado: ${n} filas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
