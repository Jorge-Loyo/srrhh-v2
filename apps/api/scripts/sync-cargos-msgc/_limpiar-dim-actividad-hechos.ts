import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const antes = await p.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*) as cnt FROM dim_actividad_hechos`
console.log('Registros antes:', antes[0].cnt)

const deleted = await p.$executeRaw`
  DELETE FROM dim_actividad_hechos
  WHERE LENGTH(id_sial_rol) IN (25, 27)
`
console.log('Eliminados (formato compuesto):', deleted)

const despues = await p.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*) as cnt FROM dim_actividad_hechos`
console.log('Registros después:', despues[0].cnt)

// Verificar que no quedan formatos raros
const formatos = await p.$queryRaw<any[]>`
  SELECT LENGTH(id_sial_rol) as len, COUNT(*) as cnt
  FROM dim_actividad_hechos
  GROUP BY 1 ORDER BY cnt DESC
`
console.log('Longitudes restantes:', formatos)

await p.$disconnect()
