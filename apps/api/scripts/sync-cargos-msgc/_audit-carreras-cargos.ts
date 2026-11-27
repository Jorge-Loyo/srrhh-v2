import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// 1. Todas las carreras
const carreras = await p.$queryRaw<{codigo_registro: string; lit_cod_reg: string; escalafon: string | null; activo: boolean}[]>`
  SELECT codigo_registro, lit_cod_reg, escalafon, activo
  FROM dim_carreras
  ORDER BY codigo_registro
`
console.log(`=== dim_carreras (${carreras.length} filas) ===`)
carreras.forEach(r =>
  console.log(`  CR=${r.codigo_registro.padEnd(6)} activo=${r.activo} esc=${r.escalafon?.padEnd(20) ?? 'NULL'.padEnd(20)} | ${r.lit_cod_reg}`)
)

// 2. Columnas reales de dim_cargos
const cols = await p.$queryRaw<{column_name: string; data_type: string}[]>`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'dim_cargos'
  ORDER BY ordinal_position
`
console.log(`\n=== dim_cargos columnas ===`)
cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`))

// 3. Cuántos dim_cargos por codigo_registro
const porCR = await p.$queryRaw<{codigo_registro: string | null; n: bigint}[]>`
  SELECT codigo_registro, COUNT(*) as n
  FROM dim_cargos
  GROUP BY codigo_registro
  ORDER BY n DESC
`
console.log(`\n=== dim_cargos por codigo_registro ===`)
porCR.forEach(r => console.log(`  CR=${(r.codigo_registro ?? 'NULL').padEnd(8)} n=${r.n}`))

// 4. Muestra de dim_cargos — 5 filas de CR=25 y CR=60
const muestraCR25 = await p.$queryRaw<Record<string, unknown>[]>`
  SELECT * FROM dim_cargos WHERE codigo_registro IN ('25','60') LIMIT 10
`
console.log(`\n=== dim_cargos muestra CR=25/60 ===`)
if (muestraCR25.length > 0) {
  console.log('Campos:', Object.keys(muestraCR25[0]).join(', '))
  muestraCR25.forEach(r => console.log(JSON.stringify(r)))
}

await p.$disconnect()
