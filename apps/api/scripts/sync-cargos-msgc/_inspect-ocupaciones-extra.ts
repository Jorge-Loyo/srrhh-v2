/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Total ocupaciones activas
const totalOcup = await p.$queryRaw<{ cantidad: number }[]>`
  SELECT count(*)::int AS cantidad FROM ocupaciones WHERE hasta IS NULL
`
console.log(`Total ocupaciones activas (hasta IS NULL): ${totalOcup[0].cantidad}`)
console.log(`Total cargos sub_estado=ocupado:          49086`)
console.log(`Diferencia:                               ${totalOcup[0].cantidad - 49086}`)

// Ocupaciones activas agrupadas por estado/sub_estado del cargo
const porEstadoCargo = await p.$queryRaw<{ estado: string; sub_estado: string | null; cantidad: number }[]>`
  SELECT c.estado::text, c.sub_estado::text, count(*)::int AS cantidad
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
  GROUP BY 1, 2
  ORDER BY 3 DESC
`
console.log('\nOcupaciones activas por estado/sub_estado del cargo:')
for (const r of porEstadoCargo) console.log(`  ${r.estado} | ${r.sub_estado ?? 'NULL'}: ${r.cantidad}`)

// Cargos con más de una ocupación activa (duplicados)
const duplicados = await p.$queryRaw<{ cargo_id: string; codigo: string | null; cantidad: number }[]>`
  SELECT o.cargo_id::text, c.codigo, count(*)::int AS cantidad
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
  GROUP BY 1, 2
  HAVING count(*) > 1
  ORDER BY 3 DESC
  LIMIT 20
`
console.log(`\nCargos con más de una ocupación activa (top 20):`)
for (const r of duplicados) console.log(`  ${r.codigo ?? r.cargo_id}: ${r.cantidad} ocupaciones`)
console.log(`  (total cargos con duplicados: se calcula abajo)`)

const totalDup = await p.$queryRaw<{ cargos: number; ocupaciones_extra: number }[]>`
  SELECT count(*)::int AS cargos, sum(cantidad - 1)::int AS ocupaciones_extra
  FROM (
    SELECT cargo_id, count(*) AS cantidad
    FROM ocupaciones WHERE hasta IS NULL
    GROUP BY cargo_id HAVING count(*) > 1
  ) t
`
console.log(`\nResumen duplicados: ${totalDup[0].cargos} cargos con >1 ocupación activa, ${totalDup[0].ocupaciones_extra} ocupaciones extra`)

await p.$disconnect()
