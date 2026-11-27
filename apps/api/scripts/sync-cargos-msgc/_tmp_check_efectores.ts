import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const puestos = await p.$queryRaw<{ efector: string; cnt: bigint }[]>`
  SELECT efector, COUNT(*) as cnt FROM dim_puestos
  WHERE efector IN ('EAIT','UAIEAIT','SSAME','SSSAME')
  GROUP BY efector ORDER BY efector
`
console.log('dim_puestos por sigla conflictiva:')
puestos.forEach(r => console.log(`  ${r.efector}: ${r.cnt}`))

const cargos = await p.$queryRaw<{ efector: string; cnt: bigint }[]>`
  SELECT efector, COUNT(*) as cnt FROM dim_cargos
  WHERE efector IN ('EAIT','UAIEAIT','SSAME','SSSAME')
  GROUP BY efector ORDER BY efector
`
console.log('dim_cargos por sigla conflictiva:')
cargos.forEach(r => console.log(`  ${r.efector}: ${r.cnt}`))

const hosp = await p.$queryRaw<{ sigla: string; nombre: string }[]>`
  SELECT sigla, nombre FROM hospitales
  WHERE sigla IN ('EAIT','UAIEAIT','SSAME','SSSAME')
`
console.log('hospitales:')
hosp.forEach(r => console.log(`  ${r.sigla}: ${r.nombre}`))

await p.$disconnect()
