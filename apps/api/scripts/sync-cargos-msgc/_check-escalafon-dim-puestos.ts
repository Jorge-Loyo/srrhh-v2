import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

console.log('\n── Valores actuales de escalafon en dim_puestos ─────────────────────────────\n')
const valores = await p.$queryRaw<any[]>`
  SELECT escalafon, COUNT(*)::int as q
  FROM dim_puestos
  GROUP BY escalafon
  ORDER BY q DESC
`
for (const r of valores) console.log(`  "${r.escalafon}": ${r.q}`)

await p.$disconnect()
