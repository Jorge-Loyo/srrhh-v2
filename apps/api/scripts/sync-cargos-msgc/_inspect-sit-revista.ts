/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ── 1. Casos raros en validacion_vacante ─────────────────────────────────────
const raros = await p.$queryRaw<{ id: string; sub_estado: string | null; codigo: string | null }[]>`
  SELECT id::text, sub_estado::text, codigo
  FROM cargos
  WHERE deleted_at IS NULL AND estado = 'validacion_vacante'
    AND (sub_estado IN ('ocupado','concurso') OR sub_estado IS NULL)
  ORDER BY sub_estado, codigo
`
console.log(`Casos raros en validacion_vacante (${raros.length}):`)
for (const r of raros) console.log(`  sub_estado=${r.sub_estado ?? 'NULL'} codigo=${r.codigo}`)

// ── 2. Valores distintos de situacion_revista en ocupaciones activas ──────────
const sitRevs = await p.$queryRaw<{ situacion_revista: string | null; cantidad: number }[]>`
  SELECT situacion_revista, count(*)::int AS cantidad
  FROM ocupaciones WHERE hasta IS NULL
  GROUP BY 1 ORDER BY 2 DESC
`
console.log('\nValores actuales de situacion_revista (ocupaciones activas):')
for (const r of sitRevs) console.log(`  "${r.situacion_revista ?? 'NULL'}": ${r.cantidad}`)

await p.$disconnect()
