/* eslint-disable no-console */
// El Excel define qué código le corresponde a cada persona.
// 1. Si el cargo destino no existe → crearlo (vigente/ocupado, clonando atributos del prefijo)
// 2. Mover la ocupación al cargo correcto (via cargo temporal para evitar conflictos unique)
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/reubicar-ocupaciones-excel.ts           # dry-run
//   npx tsx scripts/sync-cargos-msgc/reubicar-ocupaciones-excel.ts --ejecutar
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const dotacion = mapaExcel.filter(f => f.bloque === 'Dotación' && f.sial_rol_corto)

// ── Cargar estado del sistema ─────────────────────────────────────────────────
const cargos = await prisma.$queryRaw<{ codigo: string; id: string }[]>`
  SELECT codigo, id::text FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
`
const cargoIdPorCodigo = new Map(cargos.map(c => [c.codigo, c.id]))

const ocupaciones = await prisma.$queryRaw<{
  ocupacion_id: string; cargo_id: string; cargo_codigo: string; id_sial_rol: string
}[]>`
  SELECT o.id::text AS ocupacion_id, o.cargo_id::text, c.codigo AS cargo_codigo, o.id_sial_rol
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL
`
const ocupPorSial = new Map<string, typeof ocupaciones[0]>()
for (const o of ocupaciones) {
  ocupPorSial.set(o.id_sial_rol.split('-').slice(0, 2).join('-'), o)
}

// ── Clasificar ────────────────────────────────────────────────────────────────
type Movimiento = {
  ocupacion_id: string
  sial_rol: string
  cargo_origen_codigo: string
  cargo_destino_codigo: string
  cargo_destino_id: string | null  // null = hay que crearlo
}

const movimientos: Movimiento[] = []
const noExisteEnSistema: string[] = []

for (const f of dotacion) {
  const ocup = ocupPorSial.get(f.sial_rol_corto)
  if (!ocup) { noExisteEnSistema.push(f.sial_rol_corto); continue }
  if (ocup.cargo_codigo === f.codigo) continue  // ya está bien

  movimientos.push({
    ocupacion_id: ocup.ocupacion_id,
    sial_rol: f.sial_rol_corto,
    cargo_origen_codigo: ocup.cargo_codigo,
    cargo_destino_codigo: f.codigo,
    cargo_destino_id: cargoIdPorCodigo.get(f.codigo) ?? null,
  })
}

const aCrear = [...new Set(movimientos.filter(m => !m.cargo_destino_id).map(m => m.cargo_destino_codigo))]

console.log(`\nMovimientos necesarios:     ${movimientos.length}`)
console.log(`  Cargo destino existe:     ${movimientos.filter(m => m.cargo_destino_id).length}`)
console.log(`  Cargo destino a crear:    ${movimientos.filter(m => !m.cargo_destino_id).length} (${aCrear.length} únicos)`)
console.log(`Personas sin ocupación:     ${noExisteEnSistema.length}`)

for (const m of movimientos.slice(0, 5))
  console.log(`  ${m.sial_rol}: ${m.cargo_origen_codigo} → ${m.cargo_destino_codigo}${m.cargo_destino_id ? '' : ' [CREAR]'}`)
if (movimientos.length > 5) console.log(`  ... y ${movimientos.length - 5} más`)

if (dryRun) {
  console.log('\nModo simulación — usar --ejecutar para aplicar.')
  await prisma.$disconnect()
  process.exit(0)
}

// ── Paso 1: crear cargos faltantes ────────────────────────────────────────────
console.log('\nCreando cargos faltantes...')
const plantillaPorPrefijo = new Map<string, string>()
let cargosCreados = 0

for (const codigo of aCrear) {
  const prefijo = codigo.split('-').slice(0, -1).join('-')
  if (!plantillaPorPrefijo.has(prefijo)) {
    const [p] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM cargos WHERE deleted_at IS NULL AND codigo LIKE ${prefijo + '-%'} LIMIT 1
    `
    if (!p) { console.warn(`  ✗ Sin plantilla para ${prefijo}`); continue }
    plantillaPorPrefijo.set(prefijo, p.id)
  }
  const plantillaId = plantillaPorPrefijo.get(prefijo)!
  const [nuevo] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO cargos (
      id, hospital_id, escalafon_id, puesto_cargo_id,
      codigo_registro_id, especialidad_puesto_id,
      literal_puesto, especialidad_legacy, regimen,
      codigo, estado, sub_estado, origen, created_at, updated_at
    )
    SELECT gen_random_uuid(), hospital_id, escalafon_id, puesto_cargo_id,
      codigo_registro_id, especialidad_puesto_id,
      literal_puesto, especialidad_legacy, regimen,
      ${codigo}, 'vigente', 'ocupado', 'padron', now(), now()
    FROM cargos WHERE id = ${plantillaId}::uuid
    RETURNING id::text
  `
  cargoIdPorCodigo.set(codigo, nuevo.id)
  cargosCreados++
}
console.log(`✓ Cargos creados: ${cargosCreados}`)

// Actualizar cargo_destino_id en movimientos que lo necesitaban
for (const m of movimientos) {
  if (!m.cargo_destino_id) m.cargo_destino_id = cargoIdPorCodigo.get(m.cargo_destino_codigo) ?? null
}

const movimientosValidos = movimientos.filter(m => m.cargo_destino_id)
console.log(`Movimientos a ejecutar: ${movimientosValidos.length}`)

// ── Paso 2: mover via cargo temporal ─────────────────────────────────────────
console.log('Moviendo ocupaciones...')
const [tmpCargo] = await prisma.$queryRaw<{ id: string }[]>`
  INSERT INTO cargos (id, hospital_id, escalafon_id, puesto_cargo_id, estado, origen, created_at, updated_at)
  SELECT gen_random_uuid(), hospital_id, escalafon_id, puesto_cargo_id, 'no_vigente', 'padron', now(), now()
  FROM cargos WHERE id = ${movimientosValidos[0].cargo_destino_id}::uuid
  RETURNING id::text
`

for (const m of movimientosValidos)
  await prisma.$executeRaw`UPDATE ocupaciones SET cargo_id = ${tmpCargo.id}::uuid, updated_at = now() WHERE id = ${m.ocupacion_id}::uuid`

for (const m of movimientosValidos)
  await prisma.$executeRaw`UPDATE ocupaciones SET cargo_id = ${m.cargo_destino_id!}::uuid, updated_at = now() WHERE id = ${m.ocupacion_id}::uuid`

await prisma.$executeRaw`DELETE FROM cargos WHERE id = ${tmpCargo.id}::uuid`

console.log(`✓ Ocupaciones reubicadas: ${movimientosValidos.length}`)
if (noExisteEnSistema.length) console.log(`⚠ Personas sin ocupación en sistema: ${noExisteEnSistema.length}`)

await prisma.$disconnect()
