import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const r = await prisma.$queryRaw<{ efector: string; q: bigint }[]>`
    SELECT efector, COUNT(*) as q
    FROM dim_puestos
    WHERE LENGTH(efector) > 10
    GROUP BY efector
    ORDER BY q DESC
  `
  for (const row of r) console.log(`  "${row.efector}" (${row.efector.length} chars): ${row.q} filas`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
