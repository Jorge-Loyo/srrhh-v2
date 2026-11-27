import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Cuántos cargos POU tienen match via dim_puestos.dia
const r1 = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(DISTINCT dc.codigo_cargo) as cnt
  FROM dim_cargos dc
  JOIN dim_puestos dp ON dp.escritorio IS NOT NULL
    AND dp.hospitalSigla = dc.efector
  WHERE dc.modalidad = 'POU' AND dp.dia IS NOT NULL
`
console.log('Match via dim_puestos (escritorio+efector):', r1[0].cnt)

// Ver estructura de dim_puestos para cargos POU
const r2 = await p.$queryRaw<any[]>`
  SELECT dp.id_sial_rol, dp.escritorio, dp.dia, dp.efector, dp.literal_puesto
  FROM dim_puestos dp
  WHERE dp.dia IS NOT NULL
  LIMIT 5
`
console.log('dim_puestos con dia:', r2)

// Cuántos dim_puestos tienen dia poblado
const r3 = await p.$queryRaw<{ con_dia: bigint; sin_dia: bigint }[]>`
  SELECT
    COUNT(*) FILTER (WHERE dia IS NOT NULL) as con_dia,
    COUNT(*) FILTER (WHERE dia IS NULL)     as sin_dia
  FROM dim_puestos
`
console.log('dim_puestos con/sin dia:', r3[0])

// Ver si escritorio en dim_puestos coincide con algo en dim_cargos
const r4 = await p.$queryRaw<any[]>`
  SELECT dp.escritorio, dp.efector, dp.dia, dc.codigo_cargo
  FROM dim_puestos dp
  JOIN dim_cargos dc ON dc.efector = dp.efector
    AND dc.modalidad = 'POU'
  WHERE dp.dia IS NOT NULL
  LIMIT 5
`
console.log('Join dim_puestos→dim_cargos por efector:', r4)

await p.$disconnect()
