import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Ver estructura de dim_cargos POU
const r1 = await p.$queryRaw<any[]>`
  SELECT dc.codigo_cargo, dc.efector, de.codigo_efector, de.sigla, dc.cargo_id_sistema
  FROM dim_cargos dc
  LEFT JOIN dim_efectores de ON de.id = dc.efector
  WHERE dc.modalidad = 'POU'
  LIMIT 10
`
console.log('dim_cargos POU muestra:', r1)

// Ver si cargo_id_sistema tiene algun patron util
const r2 = await p.$queryRaw<any[]>`
  SELECT cargo_id_sistema FROM dim_cargos WHERE modalidad = 'POU' AND cargo_id_sistema IS NOT NULL LIMIT 5
`
console.log('cargo_id_sistema POU:', r2)

await p.$disconnect()
