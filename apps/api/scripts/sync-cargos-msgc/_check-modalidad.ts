import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const r = await p.$queryRaw<{ modalidad: string | null; cnt: bigint; ejemplos: string }[]>`
  SELECT
    modalidad,
    COUNT(*) as cnt,
    string_agg(codigo_cargo, ', ' ORDER BY codigo_cargo LIMIT 3) as ejemplos
  FROM dim_cargos
  GROUP BY modalidad
  ORDER BY cnt DESC
`
console.log('dim_cargos.modalidad:')
for (const row of r)
  console.log(`  ${String(row.modalidad ?? 'NULL').padEnd(10)} : ${row.cnt} filas | ej: ${row.ejemplos}`)

await p.$disconnect()
