/* eslint-disable no-console */
// Dos correcciones:
// A) Discrepancias: ocupación está en cargo con código X, pero el Excel dice que esa persona
//    debe estar en el cargo con código Y → mover ocupación al cargo correcto.
//    Estrategia: mover todas las discrepantes a cargo temporal, luego al destino final.
// B) Huérfanas: ocupación activa cuyo sial_rol no está en el Excel →
//    crear cargo no_vigente y mover la ocupación ahí.
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/reconciliar-ocupaciones.ts           # dry-run
//   npx tsx scripts/sync-cargos-msgc/reconciliar-ocupaciones.ts --ejecutar
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

// ── Leer mapa del Excel ───────────────────────────────────────────────────────
const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const excelPorCodigo = new Map(mapaExcel.map((f) => [f.codigo, f]))
const excelPorSialRol = new Map(mapaExcel.filter(f => f.sial_rol_corto).map((f) => [f.sial_rol_corto, f]))

const sialRolCorto = (largo: string) => largo.split('-').slice(0, 2).join('-')

// ── Leer ocupaciones activas del sistema ──────────────────────────────────────
const ocupaciones = await prisma.$queryRaw<{
  ocupacion_id: string
  cargo_id: string
  codigo: string | null
  id_sial_rol: string
  cargo_desde: Date | null
}[]>`
  SELECT o.id::text AS ocupacion_id, o.cargo_id::text, c.codigo,
    o.id_sial_rol, o.cargo_desde
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL
`

// Mapa codigo → cargo_id (para encontrar el cargo destino)
const cargoPorCodigo = new Map(ocupaciones.filter(o => o.codigo).map(o => [o.codigo!, o.cargo_id]))

// ── A. Discrepancias ──────────────────────────────────────────────────────────
console.log('\n── A. DISCREPANCIAS (código sigue a la persona) ────────────────')

type Discrepancia = {
  ocupacion_id: string
  cargo_actual_id: string   // donde está ahora
  cargo_destino_id: string  // donde debe ir (tiene el código que el Excel le asigna)
  codigo_actual: string
  codigo_destino: string
  sial_rol: string
}
const discrepancias: Discrepancia[] = []

for (const o of ocupaciones) {
  if (!o.codigo) continue
  const excelFila = excelPorCodigo.get(o.codigo)
  if (!excelFila?.sial_rol_corto) continue
  const sistemaCorto = sialRolCorto(o.id_sial_rol)
  if (sistemaCorto === excelFila.sial_rol_corto) continue

  // Esta persona debe estar en el cargo que tiene el código que el Excel le asigna
  const codigoDestino = excelPorSialRol.get(sistemaCorto)?.codigo
  if (!codigoDestino) continue // esta persona no tiene código en el Excel → la maneja la sección B
  const cargoDestinoId = cargoPorCodigo.get(codigoDestino)
  if (!cargoDestinoId) continue // el cargo destino no existe en el sistema

  discrepancias.push({
    ocupacion_id: o.ocupacion_id,
    cargo_actual_id: o.cargo_id,
    cargo_destino_id: cargoDestinoId,
    codigo_actual: o.codigo,
    codigo_destino: codigoDestino,
    sial_rol: sistemaCorto,
  })
}

console.log(`Discrepancias a corregir: ${discrepancias.length}`)
for (const d of discrepancias.slice(0, 10)) {
  console.log(`  ${d.sial_rol}: ${d.codigo_actual} → ${d.codigo_destino}`)
}
if (discrepancias.length > 10) console.log(`  ... y ${discrepancias.length - 10} más`)

// ── B. Huérfanas ──────────────────────────────────────────────────────────────
console.log('\n── B. HUÉRFANAS (sial_rol no está en el Excel) ─────────────────')

// Excluir las que ya están cubiertas por discrepancias (tienen código destino en Excel)
const discrepanciasOcupIds = new Set(discrepancias.map(d => d.ocupacion_id))
const huerfanas = ocupaciones.filter(o =>
  !excelPorSialRol.has(sialRolCorto(o.id_sial_rol)) &&
  !discrepanciasOcupIds.has(o.ocupacion_id)
)
console.log(`Ocupaciones huérfanas (crear cargo no_vigente): ${huerfanas.length}`)

if (dryRun) {
  console.log('\nModo simulación — no se escribió nada. Usar --ejecutar para aplicar.')
  await prisma.$disconnect()
  process.exit(0)
}

// ── Ejecutar A: reubicar discrepancias ────────────────────────────────────────
console.log('\nEjecutando A: reubicando discrepancias...')

// Paso 1: mover todas a un cargo temporal para liberar los destinos
// Usamos un cargo temporal inexistente (UUID fijo) — lo creamos y borramos
const tmpCargo = await prisma.$queryRaw<{ id: string }[]>`
  INSERT INTO cargos (id, hospital_id, escalafon_id, puesto_cargo_id, estado, origen, created_at, updated_at)
  SELECT gen_random_uuid(), hospital_id, escalafon_id, puesto_cargo_id,
    'no_vigente', 'padron', now(), now()
  FROM cargos WHERE id = ${discrepancias[0].cargo_actual_id}::uuid
  RETURNING id::text
`
const tmpId = tmpCargo[0].id

for (const d of discrepancias) {
  await prisma.$executeRaw`
    UPDATE ocupaciones SET cargo_id = ${tmpId}::uuid, updated_at = now()
    WHERE id = ${d.ocupacion_id}::uuid
  `
}

// Paso 2: mover cada una al cargo destino correcto
for (const d of discrepancias) {
  await prisma.$executeRaw`
    UPDATE ocupaciones SET cargo_id = ${d.cargo_destino_id}::uuid, updated_at = now()
    WHERE id = ${d.ocupacion_id}::uuid
  `
}

// Eliminar cargo temporal
await prisma.$executeRaw`DELETE FROM cargos WHERE id = ${tmpId}::uuid`

console.log(`✓ Ocupaciones reubicadas: ${discrepancias.length}`)

// ── Ejecutar B: crear cargos no_vigente para huérfanas ───────────────────────
console.log('Ejecutando B: creando cargos no_vigente para huérfanas...')
let cargosCreados = 0

for (const o of huerfanas) {
  const nuevoCargo = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO cargos (
      id, hospital_id, escalafon_id, puesto_cargo_id,
      codigo_registro_id, especialidad_puesto_id,
      literal_puesto, especialidad_legacy, regimen, codigo_repa, descripcion_repa,
      estado, origen, created_at, updated_at
    )
    SELECT
      gen_random_uuid(), hospital_id, escalafon_id, puesto_cargo_id,
      codigo_registro_id, especialidad_puesto_id,
      literal_puesto, especialidad_legacy, regimen, codigo_repa, descripcion_repa,
      'no_vigente', 'padron', now(), now()
    FROM cargos WHERE id = ${o.cargo_id}::uuid
    RETURNING id::text
  `
  await prisma.$executeRaw`
    UPDATE ocupaciones SET cargo_id = ${nuevoCargo[0].id}::uuid, updated_at = now()
    WHERE id = ${o.ocupacion_id}::uuid
  `
  cargosCreados++
}

console.log(`✓ Cargos no_vigente creados: ${cargosCreados}`)

// ── Verificación final ────────────────────────────────────────────────────────
const restantes = await prisma.$queryRaw<{ cantidad: bigint }[]>`
  SELECT count(*) AS cantidad
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.estado = 'vigente'
  GROUP BY c.id HAVING count(*) > 1
`
console.log(`\nCargos vigentes con >1 ocupación activa restantes: ${restantes.length}`)

await prisma.$disconnect()
