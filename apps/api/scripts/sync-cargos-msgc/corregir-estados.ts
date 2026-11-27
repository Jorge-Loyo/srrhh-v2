/* eslint-disable no-console */
// Correcciones de estado acordadas (segunda pasada):
// 1. Crear 23 códigos faltantes como vigente/vacante
// 2. Concurso sub_estado=vacante → concurso (152)
// 3. Exportar Excel actualizado de concursos
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/corregir-estados.ts           # dry-run
//   npx tsx scripts/sync-cargos-msgc/corregir-estados.ts --ejecutar
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const cargos = await prisma.$queryRaw<{
  codigo: string; estado: string; sub_estado: string | null
}[]>`SELECT codigo, estado, sub_estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

// ── 1. validacion_vacante → vigente/vacante ───────────────────────────────────
const aCorregirValVac = mapaExcel.filter(f => {
  const c = cargoPorCodigo.get(f.codigo)
  return c?.estado === 'validacion_vacante' &&
    (f.estado === 'En validación' || f.bloque === 'Nunca levantado')
}).map(f => f.codigo)

console.log(`\n1. validacion_vacante → vigente/vacante: ${aCorregirValVac.length}`)

// ── 2. no_vigente → vigente/vacante (solo "En validación") ───────────────────
const aCorregirNoVig = mapaExcel.filter(f => {
  const c = cargoPorCodigo.get(f.codigo)
  return c?.estado === 'no_vigente' && f.estado === 'En validación'
}).map(f => f.codigo)

console.log(`2. no_vigente → vigente/vacante: ${aCorregirNoVig.length}`)

// ── 3. Crear cargos faltantes ─────────────────────────────────────────────────
const aCrear = mapaExcel.filter(f =>
  !cargoPorCodigo.has(f.codigo) &&
  (f.estado === 'En validación' || f.bloque === 'Concurso' || f.bloque === 'Nunca levantado')
)
console.log(`3. Cargos a crear: ${aCrear.length}`)

// ── 4. Concurso sub_estado=vacante → concurso ─────────────────────────────────
const aCorregirConcurso = mapaExcel.filter(f => {
  const c = cargoPorCodigo.get(f.codigo)
  return f.bloque === 'Concurso' && c?.sub_estado === 'vacante'
}).map(f => f.codigo)

console.log(`4. Concurso vacante → concurso: ${aCorregirConcurso.length}`)

if (dryRun) {
  console.log('\nModo simulación — usar --ejecutar para aplicar.')
  await exportarConcursos()
  await prisma.$disconnect()
  process.exit(0)
}

// ── Ejecutar 1: validacion_vacante → vigente/vacante ─────────────────────────
if (aCorregirValVac.length) {
  await prisma.$executeRaw`
    UPDATE cargos SET estado = 'vigente', sub_estado = 'vacante', updated_at = now()
    WHERE codigo = ANY(${aCorregirValVac}::text[]) AND deleted_at IS NULL
  `
  console.log(`✓ validacion_vacante corregidos: ${aCorregirValVac.length}`)
}

// ── Ejecutar 2: no_vigente → vigente/vacante ──────────────────────────────────
if (aCorregirNoVig.length) {
  await prisma.$executeRaw`
    UPDATE cargos SET estado = 'vigente', sub_estado = 'vacante', updated_at = now()
    WHERE codigo = ANY(${aCorregirNoVig}::text[]) AND deleted_at IS NULL
  `
  console.log(`✓ no_vigente corregidos: ${aCorregirNoVig.length}`)
}

// ── Ejecutar 3: crear cargos faltantes ───────────────────────────────────────
// Cache de cargo-plantilla por prefijo
const plantillaPorPrefijo = new Map<string, string>()
let cargosCreados = 0

for (const f of aCrear) {
  const prefijo = f.codigo.split('-').slice(0, -1).join('-')
  if (!plantillaPorPrefijo.has(prefijo)) {
    const [plantilla] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM cargos
      WHERE deleted_at IS NULL AND codigo LIKE ${prefijo + '-%'}
      LIMIT 1
    `
    if (!plantilla) { console.warn(`  ✗ Sin plantilla para prefijo ${prefijo}, saltando ${f.codigo}`); continue }
    plantillaPorPrefijo.set(prefijo, plantilla.id)
  }
  const plantillaId = plantillaPorPrefijo.get(prefijo)!
  try {
    await prisma.$executeRaw`
      INSERT INTO cargos (
        id, hospital_id, escalafon_id, puesto_cargo_id,
        codigo_registro_id, especialidad_puesto_id,
        literal_puesto, especialidad_legacy, regimen,
        codigo, estado, sub_estado, origen, created_at, updated_at
      )
      SELECT
        gen_random_uuid(), hospital_id, escalafon_id, puesto_cargo_id,
        codigo_registro_id, especialidad_puesto_id,
        literal_puesto, especialidad_legacy, regimen,
        ${f.codigo}, 'vigente', 'vacante', 'padron', now(), now()
      FROM cargos WHERE id = ${plantillaId}::uuid
    `
    cargosCreados++
  } catch (err: any) {
    console.error(`  ✗ Error creando ${f.codigo}: ${err.message ?? err}`)
    break
  }
}
console.log(`✓ Cargos creados: ${cargosCreados}`)

// ── Ejecutar 4: Concurso vacante → concurso ───────────────────────────────────
if (aCorregirConcurso.length) {
  await prisma.$executeRaw`
    UPDATE cargos SET sub_estado = 'concurso', updated_at = now()
    WHERE codigo = ANY(${aCorregirConcurso}::text[]) AND deleted_at IS NULL
  `
  console.log(`✓ Concurso sub_estado corregido: ${aCorregirConcurso.length}`)
}

// ── Exportar Excel de concursos ───────────────────────────────────────────────
await exportarConcursos()
await prisma.$disconnect()

async function exportarConcursos() {
  const concursos = await prisma.$queryRaw<{
    codigo: string
    estado: string
    sub_estado: string | null
    literal_puesto: string | null
    escalafon: string | null
  }[]>`
    SELECT c.codigo, c.estado, c.sub_estado,
      c.literal_puesto,
      e.nombre AS escalafon
    FROM cargos c
    LEFT JOIN escalafones e ON e.id = c.escalafon_id
    WHERE c.deleted_at IS NULL AND c.codigo IS NOT NULL
      AND c.sub_estado = 'concurso'
    ORDER BY c.codigo
  `

  // Enriquecer con datos del Excel
  const excelPorCodigo = new Map(mapaExcel.map(f => [f.codigo, f]))

  const rows = concursos.map(c => {
    const excelFila = excelPorCodigo.get(c.codigo)
    return {
      'Código': c.codigo,
      'Estado Sistema': c.estado,
      'Sub Estado': c.sub_estado ?? '',
      'Literal Puesto': c.literal_puesto ?? '',
      'Escalafón': c.escalafon ?? '',
      'Bloque Excel': excelFila?.bloque ?? '(no está en Excel)',
      'Estado Excel': excelFila?.estado ?? '-',
      'SIAL Rol Excel': excelFila?.sial_rol_corto ?? '-',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Concursos')

  const outPath = path.resolve('scripts/sync-cargos-msgc/Doc/Revisar/concursos.xlsx')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  XLSX.writeFile(wb, outPath)
  console.log(`\n✓ Excel concursos exportado: ${concursos.length} filas → ${outPath}`)
}
