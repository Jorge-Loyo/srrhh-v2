import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const dist = await prisma.$queryRaw<{ planta_guardia: string | null; codigo_registro: string | null; n: bigint }[]>`
    SELECT planta_guardia, codigo_registro, COUNT(*) as n
    FROM dim_cargos
    GROUP BY planta_guardia, codigo_registro
    ORDER BY planta_guardia NULLS FIRST, n DESC
  `
  console.log('planta_guardia'.padEnd(30), 'CR'.padEnd(8), 'N')
  console.log('─'.repeat(50))
  for (const r of dist)
    console.log((r.planta_guardia ?? 'NULL').padEnd(30), (r.codigo_registro ?? '?').padEnd(8), r.n)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
