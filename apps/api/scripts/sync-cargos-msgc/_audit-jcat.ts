import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Ver todos los jcat y qué cargo representan
const jcats = await p.$queryRaw<{
  jcat: string
  cargo_jefatura: string
  cod_puesto: string | null
  familia: string
}[]>`
  SELECT jcat, cargo_jefatura, cod_puesto, familia
  FROM jcat_cargo_jefatura
  ORDER BY jcat
`
console.log(`=== jcat_cargo_jefatura (${jcats.length} filas) ===`)
jcats.forEach(r =>
  console.log(`  ${r.jcat.padEnd(6)} familia=${r.familia} cod_puesto=${(r.cod_puesto ?? 'NULL').padEnd(5)} | ${r.cargo_jefatura}`)
)

// Cuántos puestos en dim_puestos tienen cada jcat
const porJcat = await p.$queryRaw<{ jcat: string; n: bigint }[]>`
  SELECT jcat, COUNT(*) as n
  FROM dim_puestos
  WHERE jcat IS NOT NULL AND jcat <> '0'
  GROUP BY jcat
  ORDER BY n DESC
`
console.log(`\n=== dim_puestos: frecuencia por jcat ===`)
porJcat.forEach(r => console.log(`  ${r.jcat.padEnd(6)} n=${r.n}`))

await p.$disconnect()
