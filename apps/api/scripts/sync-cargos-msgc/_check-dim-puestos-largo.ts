import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const resumen = await p.$queryRaw<any[]>`
  SELECT
    LENGTH(id_sial_rol) as largo,
    COUNT(*)::int as cantidad,
    MIN(id_sial_rol) as ejemplo
  FROM dim_puestos
  GROUP BY 1
  ORDER BY 1
`
console.log('Distribución de longitudes en dim_puestos.id_sial_rol:')
for (const r of resumen) {
  const alerta = r.largo > 11 ? ' ⚠️' : ''
  console.log(`  largo=${r.largo}: ${r.cantidad}  (ej: ${r.ejemplo})${alerta}`)
}

const mayores = await p.$queryRaw<any[]>`
  SELECT COUNT(*)::int as q FROM dim_puestos WHERE LENGTH(id_sial_rol) > 11
`
console.log(`\nTotal con largo > 11: ${mayores[0].q}`)

await p.$disconnect()
