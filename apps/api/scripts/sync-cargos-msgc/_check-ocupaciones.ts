import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const desajuste = await p.$queryRaw<any[]>`
  SELECT c.sub_estado, c.estado, COUNT(*)::int as q
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
  GROUP BY c.sub_estado, c.estado
  ORDER BY q DESC
`
console.log('Ocupaciones activas (sin hasta) por estado del cargo:')
for (const r of desajuste) console.log(`  cargo.estado=${r.estado} sub_estado=${r.sub_estado}: ${r.q}`)

await p.$disconnect()
