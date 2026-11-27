import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// 1. ¿Existe columna 'carrera' en dim_cargos?
const cols = await p.$queryRaw<{ column_name: string }[]>`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'dim_cargos' ORDER BY ordinal_position
`
console.log('=== dim_cargos columnas actuales ===')
console.log(cols.map(c => c.column_name).join(', '))

// 2. Cobertura del link via dim_actividad_hechos → dim_puestos
const linkAH = await p.$queryRaw<{ con_link: bigint; total: bigint }[]>`
  SELECT
    COUNT(DISTINCT dc.codigo_cargo) as total,
    COUNT(DISTINCT CASE WHEN dp.literal_puesto IS NOT NULL THEN dc.codigo_cargo END) as con_link
  FROM dim_cargos dc
  LEFT JOIN dim_actividad_hechos ah ON ah.codigo_cargo = dc.codigo_cargo
  LEFT JOIN dim_puestos dp ON dp.id_sial_rol = ah.id_sial_rol
`
console.log(`\n=== Link via dim_actividad_hechos → dim_puestos ===`)
console.log(`dim_cargos con literal_puesto resuelto: ${linkAH[0].con_link} / ${linkAH[0].total}`)

// 3. Muestra del link — ver qué literal_puesto se resuelve
const muestra = await p.$queryRaw<{
  codigo_cargo: string
  codigo_registro: string | null
  literal_puesto_actual: string | null
  literal_puesto_resuelto: string | null
  especialidad_resuelta: string | null
}[]>`
  SELECT
    dc.codigo_cargo,
    dc.codigo_registro,
    dc.literal_puesto as literal_puesto_actual,
    dp.literal_puesto as literal_puesto_resuelto,
    dp.especialidad   as especialidad_resuelta
  FROM dim_cargos dc
  JOIN dim_actividad_hechos ah ON ah.codigo_cargo = dc.codigo_cargo
  JOIN dim_puestos dp ON dp.id_sial_rol = ah.id_sial_rol
  WHERE ah.es_actual = true
  LIMIT 15
`
console.log(`\n=== Muestra link (actuales) ===`)
muestra.forEach(r =>
  console.log(`  CR=${r.codigo_registro?.padEnd(5)} cargo=${r.codigo_cargo.padEnd(12)} | actual="${r.literal_puesto_actual}" → resuelto="${r.literal_puesto_resuelto}" esp="${r.especialidad_resuelta}"`)
)

// 4. ¿Cuántos dim_cargos tienen al menos un registro en dim_actividad_hechos?
const cobertura = await p.$queryRaw<{ con_ah: bigint; total: bigint }[]>`
  SELECT
    COUNT(DISTINCT dc.codigo_cargo) as total,
    COUNT(DISTINCT ah.codigo_cargo) as con_ah
  FROM dim_cargos dc
  LEFT JOIN dim_actividad_hechos ah ON ah.codigo_cargo = dc.codigo_cargo
`
console.log(`\n=== Cobertura dim_actividad_hechos ===`)
console.log(`dim_cargos con al menos 1 hecho: ${cobertura[0].con_ah} / ${cobertura[0].total}`)

await p.$disconnect()
