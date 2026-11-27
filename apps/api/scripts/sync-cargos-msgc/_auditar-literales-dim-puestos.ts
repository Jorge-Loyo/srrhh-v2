import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ─── Distribución de literales en dim_puestos ─────────────────────────────────
const totalPuestos = await p.$queryRaw<{cnt: bigint}[]>`SELECT COUNT(*) as cnt FROM dim_puestos`
const sinLiteral   = await p.$queryRaw<{cnt: bigint}[]>`SELECT COUNT(*) as cnt FROM dim_puestos WHERE literal_puesto IS NULL OR literal_puesto = ''`

console.log(`dim_puestos total: ${totalPuestos[0].cnt}`)
console.log(`Sin literal_puesto: ${sinLiteral[0].cnt}`)

// ─── Top literales en dim_puestos ─────────────────────────────────────────────
const topLiterales = await p.$queryRaw<{literal_puesto: string; cnt: bigint}[]>`
  SELECT literal_puesto, COUNT(*) as cnt
  FROM dim_puestos
  WHERE literal_puesto IS NOT NULL AND literal_puesto != ''
  GROUP BY literal_puesto
  ORDER BY cnt DESC
  LIMIT 30
`
console.log('\nTop 30 literales en dim_puestos:')
topLiterales.forEach(r => console.log(`  ${String(r.cnt).padStart(5)}  ${r.literal_puesto}`))

// ─── Cuántos puestos_cargo existen ────────────────────────────────────────────
const totalPC = await p.$queryRaw<{cnt: bigint}[]>`SELECT COUNT(*) as cnt FROM puestos_cargo`
console.log(`\npuestos_cargo total: ${totalPC[0].cnt}`)

// ─── Literales de dim_puestos que NO matchean ningún puestos_cargo.nombre ─────
// Normalización: lower + unaccent (si está disponible) o solo lower
const noMatch = await p.$queryRaw<{literal_puesto: string; cnt: bigint; codigo_registro: string}[]>`
  SELECT dp.literal_puesto, COUNT(*) as cnt, dp.codigo_registro
  FROM dim_puestos dp
  WHERE dp.literal_puesto IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM puestos_cargo pc
      WHERE LOWER(pc.nombre) = LOWER(dp.literal_puesto)
    )
  GROUP BY dp.literal_puesto, dp.codigo_registro
  ORDER BY cnt DESC
  LIMIT 50
`
console.log(`\nTop 50 literales de dim_puestos SIN match en puestos_cargo (por frecuencia):`)
noMatch.forEach(r => console.log(`  ${String(r.cnt).padStart(5)}  [${r.codigo_registro ?? '??'}]  ${r.literal_puesto}`))

// ─── Resumen: cuántos literales únicos no matchean ────────────────────────────
const resumen = await p.$queryRaw<{total: bigint; sin_match: bigint}[]>`
  SELECT
    COUNT(DISTINCT literal_puesto) as total,
    COUNT(DISTINCT CASE WHEN NOT EXISTS (
      SELECT 1 FROM puestos_cargo pc WHERE LOWER(pc.nombre) = LOWER(dp.literal_puesto)
    ) THEN literal_puesto END) as sin_match
  FROM dim_puestos dp
  WHERE literal_puesto IS NOT NULL AND literal_puesto != ''
`
console.log(`\nLiterales únicos en dim_puestos: ${resumen[0].total}`)
console.log(`Sin match en puestos_cargo:      ${resumen[0].sin_match}`)

await p.$disconnect()
