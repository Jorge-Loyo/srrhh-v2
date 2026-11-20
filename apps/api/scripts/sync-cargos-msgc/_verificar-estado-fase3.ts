/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const r = await p.$queryRaw<Record<string, unknown>[]>`
  SELECT
    (SELECT count(*)::int FROM cargos WHERE deleted_at IS NULL AND estado IN ('vigente','validacion_vacante')) AS vigentes_total,
    (SELECT count(*)::int FROM cargos WHERE deleted_at IS NULL AND estado = 'vigente') AS vigentes,
    (SELECT count(*)::int FROM cargos WHERE deleted_at IS NULL AND estado = 'validacion_vacante') AS validacion_vacante,
    (SELECT count(*)::int FROM cargos WHERE deleted_at IS NULL AND codigo IS NULL) AS sin_codigo,
    (SELECT count(*)::int FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL) AS con_codigo,
    (SELECT count(*)::int FROM cargos WHERE deleted_at IS NULL AND codigo ~ '^(CPH-POF-|CPH-POU-|TEC-POF-|TEC-POU-|RG-CG-|CT-|PT-|PG-|AS-DG-|AS-SS-|AS-MIN-|AS-DGA-)') AS prefijos_viejos,
    (SELECT string_agg(codigo || ' (' || nombre || ')', ', ') FROM escalafones WHERE codigo IN ('22','37')) AS escalafones_cph
`
console.log(JSON.stringify(r[0], null, 2))

// Distribución de prefijos actuales (top 30)
const prefijos = await p.$queryRaw<{ prefijo: string; cantidad: number }[]>`
  SELECT
    regexp_replace(codigo, '-[0-9]{6}$', '') AS prefijo,
    count(*)::int AS cantidad
  FROM cargos
  WHERE deleted_at IS NULL AND codigo IS NOT NULL AND estado IN ('vigente','validacion_vacante')
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 30
`
// Prefijos viejos: desglose por prefijo y estado
const viejos = await p.$queryRaw<{ prefijo: string; estado: string; cantidad: number }[]>`
  SELECT
    regexp_replace(codigo, '-[0-9]{6}$', '') AS prefijo,
    estado::text,
    count(*)::int AS cantidad
  FROM cargos
  WHERE deleted_at IS NULL
    AND codigo ~ '^(CPH-POF-|CPH-POU-|TEC-POF-|TEC-POU-|RG-CG-|CT-|PT-|PG-|AS-DG-|AS-SS-|AS-MIN-|AS-DGA-)'
  GROUP BY 1, 2
  ORDER BY 3 DESC
`
// Sin código: desglose por estado y origen
const sinCodigo = await p.$queryRaw<{ estado: string; origen: string; cantidad: number }[]>`
  SELECT estado::text, origen, count(*)::int AS cantidad
  FROM cargos
  WHERE deleted_at IS NULL AND codigo IS NULL
  GROUP BY 1, 2
  ORDER BY 3 DESC
`
// Composición jerárquica de cargos
// Nivel 1: estado del cargo
const porEstado = await p.$queryRaw<{ estado: string; cantidad: number }[]>`
  SELECT estado::text, count(*)::int AS cantidad
  FROM cargos WHERE deleted_at IS NULL
  GROUP BY 1 ORDER BY 1
`
console.log('\n── CARGOS POR ESTADO ─────────────────────────────────────')
for (const r of porEstado) console.log(`  ${r.estado}: ${r.cantidad}`)

// Nivel 2: vigentes por sub_estado (ocupado / vacante / concurso)
const vigentesSubEstado = await p.$queryRaw<{ sub_estado: string | null; cantidad: number }[]>`
  SELECT sub_estado::text, count(*)::int AS cantidad
  FROM cargos WHERE deleted_at IS NULL AND estado = 'vigente'
  GROUP BY 1 ORDER BY 2 DESC
`
console.log('\n── VIGENTES por sub_estado ───────────────────────────────')
for (const r of vigentesSubEstado) console.log(`  ${r.sub_estado ?? 'NULL'}: ${r.cantidad}`)

// Nivel 2b: validacion_vacante por sub_estado
const validacionSubEstado = await p.$queryRaw<{ sub_estado: string | null; cantidad: number }[]>`
  SELECT sub_estado::text, count(*)::int AS cantidad
  FROM cargos WHERE deleted_at IS NULL AND estado = 'validacion_vacante'
  GROUP BY 1 ORDER BY 2 DESC
`
console.log('\n── VALIDACION_VACANTE por sub_estado ─────────────────────')
for (const r of validacionSubEstado) console.log(`  ${r.sub_estado ?? 'NULL'}: ${r.cantidad}`)

// Nivel 3: ocupados (sub_estado=ocupado) por situacion_revista de la ocupacion
const ocupadosSitRev = await p.$queryRaw<{ situacion_revista: string | null; cantidad: number }[]>`
  SELECT o.situacion_revista, count(*)::int AS cantidad
  FROM cargos c
  JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
  WHERE c.deleted_at IS NULL AND c.estado = 'vigente' AND c.sub_estado = 'ocupado'
  GROUP BY 1 ORDER BY 2 DESC
`
console.log('\n── OCUPADOS por situacion_revista ────────────────────────')
for (const r of ocupadosSitRev) console.log(`  ${r.situacion_revista ?? 'NULL'}: ${r.cantidad}`)

await p.$disconnect()
