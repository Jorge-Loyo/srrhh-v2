import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ¿Cómo luce literal_puesto en dim_cargos vs dim_tipos_cargos?
const muestraCargos = await p.$queryRaw<{
  codigo_registro: string | null
  literal_puesto: string | null
  n: bigint
}[]>`
  SELECT codigo_registro, literal_puesto, COUNT(*) as n
  FROM dim_cargos
  WHERE codigo_registro IS NOT NULL AND literal_puesto IS NOT NULL
  GROUP BY codigo_registro, literal_puesto
  ORDER BY codigo_registro, n DESC
  LIMIT 20
`
console.log('=== dim_cargos: muestra literal_puesto ===')
muestraCargos.forEach(r =>
  console.log(`  CR=${r.codigo_registro?.padEnd(6)} n=${String(r.n).padEnd(5)} | "${r.literal_puesto}"`)
)

// ¿Cómo luce nombre en dim_tipos_cargos para los mismos CRs?
const muestraTipos = await p.$queryRaw<{
  codigo_registro: string
  nombre: string
}[]>`
  SELECT codigo_registro, nombre
  FROM dim_tipos_cargos
  ORDER BY codigo_registro, nombre
  LIMIT 20
`
console.log('\n=== dim_tipos_cargos: muestra nombre ===')
muestraTipos.forEach(r =>
  console.log(`  CR=${r.codigo_registro.padEnd(6)} | "${r.nombre}"`)
)

// Intentar match case-insensitive — ¿cuántos matchean?
const matchCI = await p.$queryRaw<{ n: bigint }[]>`
  SELECT COUNT(*) as n
  FROM dim_cargos dc
  JOIN dim_tipos_cargos tc
    ON tc.codigo_registro = dc.codigo_registro
   AND lower(tc.nombre)   = lower(dc.literal_puesto)
  WHERE dc.literal_puesto IS NOT NULL
`
console.log(`\nMatch case-insensitive: ${matchCI[0].n} / 53064`)

// Intentar match sin acentos (unaccent)
const matchUA = await p.$queryRaw<{ n: bigint }[]>`
  SELECT COUNT(*) as n
  FROM dim_cargos dc
  JOIN dim_tipos_cargos tc
    ON tc.codigo_registro = dc.codigo_registro
   AND lower(unaccent(tc.nombre)) = lower(unaccent(dc.literal_puesto))
  WHERE dc.literal_puesto IS NOT NULL
`
console.log(`Match unaccent:          ${matchUA[0].n} / 53064`)

// Ver ejemplos que NO matchean
const noMatch = await p.$queryRaw<{
  codigo_registro: string | null
  literal_puesto: string | null
  n: bigint
}[]>`
  SELECT dc.codigo_registro, dc.literal_puesto, COUNT(*) as n
  FROM dim_cargos dc
  WHERE dc.literal_puesto IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM dim_tipos_cargos tc
      WHERE tc.codigo_registro = dc.codigo_registro
        AND lower(unaccent(tc.nombre)) = lower(unaccent(dc.literal_puesto))
    )
  GROUP BY dc.codigo_registro, dc.literal_puesto
  ORDER BY n DESC
  LIMIT 15
`
console.log('\n=== dim_cargos sin match en dim_tipos_cargos (top 15) ===')
noMatch.forEach(r =>
  console.log(`  CR=${r.codigo_registro?.padEnd(6)} n=${String(r.n).padEnd(5)} | "${r.literal_puesto}"`)
)

await p.$disconnect()
