import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Cobertura general
const cobertura = await p.$queryRaw<{ con_dia: bigint; sin_dia: bigint; total: bigint }[]>`
  SELECT
    COUNT(*) FILTER (WHERE dia_pou IS NOT NULL) as con_dia,
    COUNT(*) FILTER (WHERE dia_pou IS NULL)     as sin_dia,
    COUNT(*)                                    as total
  FROM dim_cargos WHERE modalidad = 'POU'
`
const { con_dia, sin_dia, total } = cobertura[0]
console.log(`\nPOU total:     ${total}`)
console.log(`Con dia_pou:   ${con_dia} (${(Number(con_dia)*100/Number(total)).toFixed(1)}%)`)
console.log(`Sin dia_pou:   ${sin_dia} (${(Number(sin_dia)*100/Number(total)).toFixed(1)}%)`)

// Distribución de días
const dias = await p.$queryRaw<{ dia_pou: string; cnt: bigint }[]>`
  SELECT dia_pou, COUNT(*) as cnt
  FROM dim_cargos WHERE modalidad = 'POU' AND dia_pou IS NOT NULL
  GROUP BY dia_pou ORDER BY cnt DESC
`
console.log('\nDistribución por día:')
for (const { dia_pou, cnt } of dias) console.log(`  ${dia_pou.padEnd(12)}: ${cnt}`)

// Sin dia_pou: ¿tienen asignación en dim_actividad_hechos?
const sinDiaConAsig = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(DISTINCT dc.codigo_cargo) as cnt
  FROM dim_cargos dc
  JOIN dim_actividad_hechos fa ON
    'CPH-J-G-' || lpad(ltrim(split_part(fa.codigo_cargo,'CPH-J-POU-',2),'0'),4,'0') = dc.codigo_cargo
  WHERE dc.modalidad = 'POU' AND dc.dia_pou IS NULL
    AND fa.codigo_cargo LIKE 'CPH-J-POU-%'
`
console.log(`\nSin dia_pou pero con asignación en hechos: ${sinDiaConAsig[0].cnt}`)

// Sin dia_pou: ¿tienen dim_puestos.dia?
const sinDiaConPuesto = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(DISTINCT dc.codigo_cargo) as cnt
  FROM dim_cargos dc
  JOIN dim_actividad_hechos fa ON
    'CPH-J-G-' || lpad(ltrim(split_part(fa.codigo_cargo,'CPH-J-POU-',2),'0'),4,'0') = dc.codigo_cargo
  JOIN dim_puestos dp ON split_part(dp.id_sial_rol,'-',1) = split_part(fa.id_sial_rol,'-',1)
  WHERE dc.modalidad = 'POU' AND dc.dia_pou IS NULL
    AND fa.codigo_cargo LIKE 'CPH-J-POU-%'
    AND dp.dia IS NOT NULL
`
console.log(`Sin dia_pou pero con dim_puestos.dia disponible: ${sinDiaConPuesto[0].cnt}`)

await p.$disconnect()
