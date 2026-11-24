import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// 1. Columnas reales de dim_cargos
const cols = await p.$queryRaw<{column_name: string}[]>`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'dim_cargos' ORDER BY ordinal_position
`
console.log('=== dim_cargos columnas ===')
console.log(cols.map(c => c.column_name).join(', '))

// 2. Totales
const [totTC, totEsp, totCargos] = await Promise.all([
  p.$queryRaw<{n: bigint}[]>`SELECT COUNT(*) as n FROM dim_tipos_cargos`,
  p.$queryRaw<{n: bigint}[]>`SELECT COUNT(*) as n FROM dim_especialidades`,
  p.$queryRaw<{n: bigint}[]>`SELECT COUNT(*) as n FROM dim_cargos`,
])
console.log(`\n=== Totales ===`)
console.log(`dim_tipos_cargos:  ${totTC[0].n}`)
console.log(`dim_especialidades: ${totEsp[0].n}`)
console.log(`dim_cargos:         ${totCargos[0].n}`)

// 3. Cobertura FKs en dim_cargos
const cob = await p.$queryRaw<{total: bigint; con_tipo: bigint; con_esp: bigint; con_lit: bigint}[]>`
  SELECT
    COUNT(*) as total,
    COUNT(tipo_cargo_id) as con_tipo,
    COUNT(especialidad_id) as con_esp,
    COUNT(literal_puesto) as con_lit
  FROM dim_cargos
`
console.log(`\n=== dim_cargos cobertura ===`)
console.log(`total:            ${cob[0].total}`)
console.log(`con tipo_cargo_id: ${cob[0].con_tipo}`)
console.log(`con especialidad_id: ${cob[0].con_esp}`)
console.log(`con literal_puesto:  ${cob[0].con_lit}`)

// 4. ¿Hay duplicados en dim_tipos_cargos? (mismo codigo_registro+nombre)
const dupes = await p.$queryRaw<{codigo_registro: string; nombre: string; n: bigint}[]>`
  SELECT codigo_registro, nombre, COUNT(*) as n
  FROM dim_tipos_cargos
  GROUP BY codigo_registro, nombre
  HAVING COUNT(*) > 1
  LIMIT 10
`
console.log(`\n=== dim_tipos_cargos duplicados: ${dupes.length} ===`)
dupes.forEach(d => console.log(`  CR=${d.codigo_registro} n=${d.n} | ${d.nombre}`))

// 5. Distribución por codigo_registro (cuántos puestos únicos por carrera)
const distCR = await p.$queryRaw<{codigo_registro: string; n_puestos: bigint}[]>`
  SELECT codigo_registro, COUNT(*) as n_puestos
  FROM dim_tipos_cargos
  GROUP BY codigo_registro
  ORDER BY n_puestos DESC
  LIMIT 20
`
console.log(`\n=== dim_tipos_cargos: puestos por codigo_registro (top 20) ===`)
distCR.forEach(r => console.log(`  CR=${r.codigo_registro.padEnd(5)} puestos=${r.n_puestos}`))

// 6. Muestra CR=37 (médicos) — cuántos puestos y cuáles
const cr37 = await p.$queryRaw<{id: number; nombre: string; tipo_cargo: string; n_cargos: bigint}[]>`
  SELECT tc.id, tc.nombre, tc.tipo_cargo, COUNT(dc.codigo_cargo) as n_cargos
  FROM dim_tipos_cargos tc
  LEFT JOIN dim_cargos dc ON dc.tipo_cargo_id = tc.id
  WHERE tc.codigo_registro = '37'
  GROUP BY tc.id, tc.nombre, tc.tipo_cargo
  ORDER BY tc.nombre
`
console.log(`\n=== CR=37 puestos (${cr37.length} filas) ===`)
cr37.forEach(r => console.log(`  [${r.id}] tipo=${r.tipo_cargo} cargos=${r.n_cargos} | ${r.nombre}`))

// 7. ¿dim_tipos_cargos tiene columna efector_id?
const hasEfector = await p.$queryRaw<{n: bigint}[]>`
  SELECT COUNT(*) as n FROM information_schema.columns
  WHERE table_name = 'dim_tipos_cargos' AND column_name = 'efector_id'
`
console.log(`\n=== dim_tipos_cargos.efector_id existe: ${hasEfector[0].n > 0} ===`)

// 8. Muestra de dim_tipos_cargos — primeras 10 filas
const sample = await p.$queryRaw<{id: number; codigo_registro: string; nombre: string; tipo_cargo: string}[]>`
  SELECT id, codigo_registro, nombre, tipo_cargo FROM dim_tipos_cargos
  ORDER BY codigo_registro, nombre LIMIT 10
`
console.log(`\n=== dim_tipos_cargos muestra ===`)
sample.forEach(r => console.log(`  [${r.id}] CR=${r.codigo_registro} tipo=${r.tipo_cargo} | ${r.nombre}`))

await p.$disconnect()
