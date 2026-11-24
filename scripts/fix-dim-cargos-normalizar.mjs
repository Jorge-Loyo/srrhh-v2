import { PrismaClient } from '@prisma/client'

const DB = 'postgresql://neondb_owner:npg_Sse7auT1knHB@ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const prisma = new PrismaClient({ datasources: { db: { url: DB } } })

const DRY_RUN = process.argv.includes('--dry-run')
console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APLICANDO CAMBIOS ===')

// ── 1. Diagnóstico previo ────────────────────────────────────────────────────

const estadosActuales = await prisma.$queryRaw`
  SELECT estado, count(*)::int as total FROM dim_cargos GROUP BY 1 ORDER BY 2 DESC
`
console.log('\nEstados actuales:')
console.table(estadosActuales)

// Muestra de códigos con número corto (sin padding de 6 dígitos)
const sinPadding = await prisma.$queryRaw`
  SELECT codigo_cargo
  FROM dim_cargos
  WHERE codigo_cargo ~ '-[0-9]{1,5}$'
  LIMIT 10
`
console.log('\nEjemplos de códigos sin padding (a corregir):')
console.table(sinPadding)

const [{ total_sin_padding }] = await prisma.$queryRaw`
  SELECT count(*)::int as total_sin_padding
  FROM dim_cargos
  WHERE codigo_cargo ~ '-[0-9]{1,5}$'
`
console.log(`Total códigos sin padding: ${total_sin_padding}`)

const [{ total_vigente }] = await prisma.$queryRaw`
  SELECT count(*)::int as total_vigente FROM dim_cargos WHERE estado = 'Vigente'
`
const [{ total_validacion }] = await prisma.$queryRaw`
  SELECT count(*)::int as total_validacion FROM dim_cargos WHERE estado = 'En validación'
`
console.log(`\nA normalizar: ${total_vigente} 'Vigente' → 'vigente', ${total_validacion} 'En validación' → 'validacion_vacante'`)

if (DRY_RUN) {
  console.log('\nDRY RUN: no se aplicaron cambios.')
  await prisma.$disconnect()
  process.exit(0)
}

// ── 2. Aplicar en transacción ────────────────────────────────────────────────

await prisma.$transaction(async (tx) => {
  // 2a. Normalizar estado
  const r1 = await tx.$executeRaw`
    UPDATE dim_cargos SET estado = 'vigente' WHERE estado = 'Vigente'
  `
  console.log(`\nEstado 'Vigente' → 'vigente': ${r1} filas`)

  const r2 = await tx.$executeRaw`
    UPDATE dim_cargos SET estado = 'validacion_vacante' WHERE estado = 'En validación'
  `
  console.log(`Estado 'En validación' → 'validacion_vacante': ${r2} filas`)

  // 2b. Repadear codigo_cargo: extraer prefijo y número, reconstruir con 6 dígitos
  // Formato actual: CPH-J-P-2315  →  CPH-J-P-002315
  // Regex: todo antes del último guión + número = prefijo + seq
  const r3 = await tx.$executeRaw`
    UPDATE dim_cargos
    SET codigo_cargo = regexp_replace(
      codigo_cargo,
      '^(.*)-([0-9]{1,5})$',
      '\1-' || lpad(regexp_replace(codigo_cargo, '^.*-([0-9]+)$', '\1'), 6, '0')
    )
    WHERE codigo_cargo ~ '-[0-9]{1,5}$'
  `
  console.log(`Códigos repaddeados a 6 dígitos: ${r3} filas`)
})

// ── 3. Verificación post ─────────────────────────────────────────────────────

const estadosPost = await prisma.$queryRaw`
  SELECT estado, count(*)::int as total FROM dim_cargos GROUP BY 1 ORDER BY 2 DESC
`
console.log('\nEstados post-fix:')
console.table(estadosPost)

const muestraPost = await prisma.$queryRaw`
  SELECT codigo_cargo FROM dim_cargos ORDER BY codigo_cargo LIMIT 15
`
console.log('\nMuestra de códigos post-fix:')
console.table(muestraPost)

const [{ restantes }] = await prisma.$queryRaw`
  SELECT count(*)::int as restantes FROM dim_cargos WHERE codigo_cargo ~ '-[0-9]{1,5}$'
`
console.log(`Códigos sin padding restantes: ${restantes} (debe ser 0)`)

await prisma.$disconnect()
