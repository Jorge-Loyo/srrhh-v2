import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ═══════════════════════════════════════════════════════════════════════════════
// 4.2.1 — Literales de dim_puestos sin entrada en dim_tipos_cargos
// ═══════════════════════════════════════════════════════════════════════════════

const sinMatchTipos = await p.$queryRaw<{
  codigo_registro: string
  literal_puesto: string
  cnt: bigint
}[]>`
  SELECT dp.codigo_registro, dp.literal_puesto, COUNT(*) AS cnt
  FROM dim_puestos dp
  WHERE dp.literal_puesto IS NOT NULL AND dp.literal_puesto != ''
    AND NOT EXISTS (
      SELECT 1 FROM dim_tipos_cargos tc
      WHERE tc.codigo_registro = dp.codigo_registro
        AND LOWER(tc.nombre) = LOWER(dp.literal_puesto)
    )
  GROUP BY dp.codigo_registro, dp.literal_puesto
  ORDER BY cnt DESC
  LIMIT 60
`

console.log('═══ 4.2.1 — Literales dim_puestos SIN match en dim_tipos_cargos (top 60) ═══')
if (sinMatchTipos.length === 0) {
  console.log('  ✅ Todos los literales tienen entrada en dim_tipos_cargos')
} else {
  sinMatchTipos.forEach(r =>
    console.log(`  ${String(r.cnt).padStart(5)}  [${r.codigo_registro ?? '??'}]  ${r.literal_puesto}`)
  )
}

const resumenMatch = await p.$queryRaw<{ total: bigint; sin_match: bigint }[]>`
  SELECT
    COUNT(DISTINCT (dp.codigo_registro, dp.literal_puesto)) AS total,
    COUNT(DISTINCT CASE WHEN NOT EXISTS (
      SELECT 1 FROM dim_tipos_cargos tc
      WHERE tc.codigo_registro = dp.codigo_registro
        AND LOWER(tc.nombre) = LOWER(dp.literal_puesto)
    ) THEN (dp.codigo_registro, dp.literal_puesto) END) AS sin_match
  FROM dim_puestos dp
  WHERE dp.literal_puesto IS NOT NULL AND dp.literal_puesto != ''
`
console.log(`\n  Pares (CR, literal) únicos en dim_puestos: ${resumenMatch[0].total}`)
console.log(`  Sin match en dim_tipos_cargos:             ${resumenMatch[0].sin_match}`)

// ═══════════════════════════════════════════════════════════════════════════════
// 4.2.2 — Foco en CR 87 y CR 85 (casos documentados en el sprint)
// ═══════════════════════════════════════════════════════════════════════════════

const cr87 = await p.$queryRaw<{ literal_puesto: string; cnt: bigint }[]>`
  SELECT literal_puesto, COUNT(*) AS cnt
  FROM dim_puestos
  WHERE codigo_registro = '87'
  GROUP BY literal_puesto
  ORDER BY cnt DESC
`
console.log('\n═══ 4.2.2 — CR 87: literales presentes en dim_puestos ═══')
cr87.forEach(r => console.log(`  ${String(r.cnt).padStart(5)}  "${r.literal_puesto}"`))

const cr87EnTipos = await p.$queryRaw<{ nombre: string }[]>`
  SELECT nombre FROM dim_tipos_cargos WHERE codigo_registro = '87' ORDER BY nombre
`
console.log('\n  CR 87 en dim_tipos_cargos:')
if (cr87EnTipos.length === 0) console.log('  (ninguno)')
else cr87EnTipos.forEach(r => console.log(`    "${r.nombre}"`))

const cr85 = await p.$queryRaw<{ literal_puesto: string; cnt: bigint }[]>`
  SELECT literal_puesto, COUNT(*) AS cnt
  FROM dim_puestos
  WHERE codigo_registro = '85'
  GROUP BY literal_puesto
  ORDER BY cnt DESC
`
console.log('\n═══ 4.2.2 — CR 85: literales presentes en dim_puestos ═══')
cr85.forEach(r => console.log(`  ${String(r.cnt).padStart(5)}  "${r.literal_puesto}"`))

const cr85EnTipos = await p.$queryRaw<{ nombre: string }[]>`
  SELECT nombre FROM dim_tipos_cargos WHERE codigo_registro = '85' ORDER BY nombre
`
console.log('\n  CR 85 en dim_tipos_cargos:')
if (cr85EnTipos.length === 0) console.log('  (ninguno)')
else cr85EnTipos.forEach(r => console.log(`    "${r.nombre}"`))

// ═══════════════════════════════════════════════════════════════════════════════
// 4.2.3 — Cobertura de cod_rep y desc_rep en dim_puestos
// ═══════════════════════════════════════════════════════════════════════════════

const coberturaCodRep = await p.$queryRaw<{
  total: bigint
  con_cod_rep: bigint
  con_desc_rep: bigint
  sin_cod_rep: bigint
  sin_desc_rep: bigint
}[]>`
  SELECT
    COUNT(*) AS total,
    COUNT(cod_rep) AS con_cod_rep,
    COUNT(desc_rep) AS con_desc_rep,
    COUNT(*) - COUNT(cod_rep) AS sin_cod_rep,
    COUNT(*) - COUNT(desc_rep) AS sin_desc_rep
  FROM dim_puestos
`
const c = coberturaCodRep[0]
console.log('\n═══ 4.2.3 — Cobertura cod_rep / desc_rep en dim_puestos ═══')
console.log(`  Total puestos:    ${c.total}`)
console.log(`  Con cod_rep:      ${c.con_cod_rep}  (sin: ${c.sin_cod_rep})`)
console.log(`  Con desc_rep:     ${c.con_desc_rep}  (sin: ${c.sin_desc_rep})`)

// Distribución de los que tienen cod_rep pero no desc_rep (o viceversa)
const inconsistentes = await p.$queryRaw<{ caso: string; cnt: bigint }[]>`
  SELECT
    CASE
      WHEN cod_rep IS NOT NULL AND desc_rep IS NULL THEN 'cod_rep SI / desc_rep NO'
      WHEN cod_rep IS NULL AND desc_rep IS NOT NULL THEN 'cod_rep NO / desc_rep SI'
      WHEN cod_rep IS NULL AND desc_rep IS NULL     THEN 'ambos NULL'
      ELSE 'ambos presentes'
    END AS caso,
    COUNT(*) AS cnt
  FROM dim_puestos
  GROUP BY 1
  ORDER BY cnt DESC
`
console.log('\n  Distribución:')
inconsistentes.forEach(r => console.log(`    ${String(r.cnt).padStart(6)}  ${r.caso}`))

// Top efectores con más puestos sin cod_rep
const sinCodRepPorEfector = await p.$queryRaw<{ efector: string; sin_cod_rep: bigint }[]>`
  SELECT efector, COUNT(*) AS sin_cod_rep
  FROM dim_puestos
  WHERE cod_rep IS NULL
  GROUP BY efector
  ORDER BY sin_cod_rep DESC
  LIMIT 15
`
console.log('\n  Top 15 efectores con más puestos sin cod_rep:')
sinCodRepPorEfector.forEach(r =>
  console.log(`    ${String(r.sin_cod_rep).padStart(5)}  ${r.efector ?? '(null)'}`)
)

// ¿Hay fuente alternativa? Cruzar con organigramas por sigla
const fuenteOrganigrama = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(*) AS cnt
  FROM dim_puestos dp
  JOIN organigramas o ON o.sigla = dp.efector
  WHERE dp.cod_rep IS NULL AND o.codigo_reparticion IS NOT NULL
`
console.log(`\n  Puestos sin cod_rep que tienen match en organigramas: ${fuenteOrganigrama[0].cnt}`)

await p.$disconnect()
