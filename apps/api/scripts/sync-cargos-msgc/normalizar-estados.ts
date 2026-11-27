/* eslint-disable no-console */
// Normaliza:
//   1. sub_estado de cargos validacion_vacante → siempre 'vacante' (no puede ser ocupado/concurso/NULL)
//   2. situacion_revista de ocupaciones → 'activo' | 'retencion_de_cargo' | 'comisionado'
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/normalizar-estados.ts           # dry-run
//   npx tsx scripts/sync-cargos-msgc/normalizar-estados.ts --ejecutar
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

// ── 1. sub_estado de validacion_vacante ──────────────────────────────────────
const vvRaros = await p.$queryRaw<{ cantidad: number }[]>`
  SELECT count(*)::int AS cantidad FROM cargos
  WHERE deleted_at IS NULL AND estado = 'validacion_vacante'
    AND (sub_estado != 'vacante' OR sub_estado IS NULL)
`
console.log(`validacion_vacante con sub_estado incorrecto: ${vvRaros[0].cantidad}`)

// ── 2. situacion_revista — mapeo de normalización ────────────────────────────
// Catálogo cerrado (decisión C2 del sprint): activo | retencion_de_cargo | comisionado
const mapeoSitRev: Record<string, string> = {
  'Activo':            'activo',
  'Retencion de Cargo':'retencion_de_cargo',
  'retencion de cargo':'retencion_de_cargo',
  'Comision':          'comisionado',
  'Comisión':          'comisionado',
}

const sitRevAntes = await p.$queryRaw<{ situacion_revista: string | null; cantidad: number }[]>`
  SELECT situacion_revista, count(*)::int AS cantidad
  FROM ocupaciones WHERE hasta IS NULL
  GROUP BY 1 ORDER BY 2 DESC
`
console.log('\nsituacion_revista antes:')
for (const r of sitRevAntes) console.log(`  "${r.situacion_revista ?? 'NULL'}": ${r.cantidad}`)

const aCorregir = sitRevAntes.filter(r => r.situacion_revista && mapeoSitRev[r.situacion_revista])
console.log(`\nA normalizar: ${aCorregir.reduce((a, r) => a + r.cantidad, 0)} ocupaciones`)
for (const r of aCorregir) console.log(`  "${r.situacion_revista}" → "${mapeoSitRev[r.situacion_revista!]}"`)

if (dryRun) {
  console.log('\nModo simulación — no se escribió nada. Usar --ejecutar para aplicar.')
  await p.$disconnect()
  process.exit(0)
}

// ── Ejecutar ─────────────────────────────────────────────────────────────────

// 1. Corregir sub_estado de validacion_vacante
const n1 = await p.$executeRaw`
  UPDATE cargos SET sub_estado = 'vacante', updated_at = now()
  WHERE deleted_at IS NULL AND estado = 'validacion_vacante'
    AND (sub_estado != 'vacante' OR sub_estado IS NULL)
`
console.log(`\n1. validacion_vacante corregidos: ${n1}`)

// 2. Normalizar situacion_revista
let totalSitRev = 0
for (const [desde, hasta] of Object.entries(mapeoSitRev)) {
  const n = await p.$executeRaw`
    UPDATE ocupaciones SET situacion_revista = ${hasta}, updated_at = now()
    WHERE hasta IS NULL AND situacion_revista = ${desde}
  `
  if (Number(n) > 0) console.log(`  "${desde}" → "${hasta}": ${n}`)
  totalSitRev += Number(n)
}
console.log(`2. situacion_revista normalizadas: ${totalSitRev}`)

// ── Verificación ─────────────────────────────────────────────────────────────
const vvPost = await p.$queryRaw<{ sub_estado: string | null; cantidad: number }[]>`
  SELECT sub_estado::text, count(*)::int AS cantidad FROM cargos
  WHERE deleted_at IS NULL AND estado = 'validacion_vacante'
  GROUP BY 1
`
console.log('\nvalidacion_vacante post-normalización:')
for (const r of vvPost) console.log(`  ${r.sub_estado ?? 'NULL'}: ${r.cantidad}`)

const sitRevPost = await p.$queryRaw<{ situacion_revista: string | null; cantidad: number }[]>`
  SELECT situacion_revista, count(*)::int AS cantidad
  FROM ocupaciones WHERE hasta IS NULL
  GROUP BY 1 ORDER BY 2 DESC
`
console.log('\nsituacion_revista post-normalización:')
for (const r of sitRevPost) console.log(`  "${r.situacion_revista ?? 'NULL'}": ${r.cantidad}`)

await p.$disconnect()
