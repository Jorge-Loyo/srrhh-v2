import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ═══════════════════════════════════════════════════════════════════════════════
// 4.6.1 — CRs en dim_puestos sin entrada en dim_carreras
// ═══════════════════════════════════════════════════════════════════════════════

const sinCarrera = await p.$queryRaw<{ codigo_registro: string; puestos: bigint }[]>`
  SELECT dp.codigo_registro, COUNT(*) AS puestos
  FROM dim_puestos dp
  WHERE dp.codigo_registro IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM dim_carreras dc WHERE dc.codigo_registro = dp.codigo_registro
    )
  GROUP BY dp.codigo_registro
  ORDER BY puestos DESC
`

console.log('═══ 4.6.1 — CRs en dim_puestos SIN entrada en dim_carreras ═══')
if (sinCarrera.length === 0) {
  console.log('  ✅ Cobertura completa — todos los CRs de dim_puestos tienen entrada en dim_carreras')
} else {
  console.log(`  ⚠️  ${sinCarrera.length} CRs sin cobertura:`)
  sinCarrera.forEach(r => console.log(`    [${r.codigo_registro}]  ${r.puestos} puestos`))
}

// CRs en dim_puestos con NULL en codigo_registro
const sinCr = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(*) AS cnt FROM dim_puestos WHERE codigo_registro IS NULL
`
console.log(`\n  Puestos con codigo_registro NULL: ${sinCr[0].cnt}`)

// ═══════════════════════════════════════════════════════════════════════════════
// 4.6.2 — Estado del campo escalafon en dim_carreras
// ═══════════════════════════════════════════════════════════════════════════════

const sinEscalafon = await p.$queryRaw<{ codigo_registro: string; lit_cod_reg: string }[]>`
  SELECT codigo_registro, lit_cod_reg
  FROM dim_carreras
  WHERE escalafon IS NULL OR escalafon = ''
  ORDER BY codigo_registro
`

console.log('\n═══ 4.6.2 — dim_carreras con escalafon NULL ═══')
if (sinEscalafon.length === 0) {
  console.log('  ✅ Todos los registros tienen escalafon poblado')
} else {
  console.log(`  ⚠️  ${sinEscalafon.length} sin escalafon:`)
  sinEscalafon.forEach(r => console.log(`    [${r.codigo_registro}]  ${r.lit_cod_reg}`))

  // Buscar en codigos_registro (tabla operativa) si tienen escalafon disponible
  const fuente = await p.$queryRaw<{ codigo: string; escalafon: string }[]>`
    SELECT cr.codigo, e.nombre AS escalafon
    FROM codigos_registro cr
    JOIN escalafones e ON e.id = cr.escalafon_id
    WHERE cr.codigo = ANY(${sinEscalafon.map(r => r.codigo_registro)}::varchar[])
    ORDER BY cr.codigo
  `
  if (fuente.length > 0) {
    console.log('\n  Fuente disponible en codigos_registro:')
    fuente.forEach(r => console.log(`    [${r.codigo}]  → "${r.escalafon}"`))
  } else {
    console.log('\n  Sin fuente en codigos_registro para esos CRs')
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Resumen general de dim_carreras
// ═══════════════════════════════════════════════════════════════════════════════

const resumen = await p.$queryRaw<{ total: bigint; con_escalafon: bigint; sin_escalafon: bigint }[]>`
  SELECT
    COUNT(*) AS total,
    COUNT(escalafon) AS con_escalafon,
    COUNT(*) - COUNT(escalafon) AS sin_escalafon
  FROM dim_carreras
`
const r = resumen[0]
console.log(`\n═══ Resumen dim_carreras ═══`)
console.log(`  Total:          ${r.total}`)
console.log(`  Con escalafon:  ${r.con_escalafon}`)
console.log(`  Sin escalafon:  ${r.sin_escalafon}`)

await p.$disconnect()
