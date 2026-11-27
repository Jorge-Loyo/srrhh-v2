/* eslint-disable no-console */
// Segunda pasada de correcciones:
// 1. Concurso con sub_estado=vacante u ocupado → concurso (152+67=219)
// 2. Crear 23 cargos faltantes Dotación → vigente/vacante
// 3. Los 1511 sin ocupación activa → recalcular sub_estado a vacante
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/corregir-estados-2.ts
//   npx tsx scripts/sync-cargos-msgc/corregir-estados-2.ts --ejecutar
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const cargos = await prisma.$queryRaw<{ codigo: string; estado: string; sub_estado: string | null }[]>`
  SELECT codigo, estado, sub_estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

const ocupActivas = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL
`
const ocupPorCodigo = new Map<string, Set<string>>()
for (const o of ocupActivas) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!ocupPorCodigo.has(o.codigo)) ocupPorCodigo.set(o.codigo, new Set())
  ocupPorCodigo.get(o.codigo)!.add(corto)
}

// ── 1. Concurso con sub_estado incorrecto ─────────────────────────────────────
const concursoMal = mapaExcel
  .filter(f => f.bloque === 'Concurso')
  .map(f => f.codigo)
  .filter(cod => {
    const c = cargoPorCodigo.get(cod)
    return c && c.sub_estado !== 'concurso'
  })
console.log(`1. Concurso sub_estado incorrecto → concurso: ${concursoMal.length}`)

// ── 2. Códigos no existentes (Dotación) ──────────────────────────────────────
const noExiste = mapaExcel.filter(f => !cargoPorCodigo.has(f.codigo))
console.log(`2. Códigos a crear: ${noExiste.length}`)

// ── 3. Cargos Dotación sin ocupación activa → sub_estado=vacante ──────────────
const sinOcupCodigos = mapaExcel
  .filter(f => {
    if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
    const c = cargoPorCodigo.get(f.codigo)
    if (!c) return false
    return !(ocupPorCodigo.get(f.codigo)?.has(f.sial_rol_corto))
  })
  .map(f => f.codigo)
  .filter(cod => cargoPorCodigo.get(cod)?.sub_estado !== 'vacante')

console.log(`3. Dotación sin ocupación → sub_estado=vacante: ${sinOcupCodigos.length}`)

if (dryRun) {
  console.log('\nModo simulación — usar --ejecutar para aplicar.')
  await prisma.$disconnect()
  process.exit(0)
}

// ── Ejecutar 1 ────────────────────────────────────────────────────────────────
if (concursoMal.length) {
  await prisma.$executeRaw`
    UPDATE cargos SET sub_estado = 'concurso', updated_at = now()
    WHERE codigo = ANY(${concursoMal}::text[]) AND deleted_at IS NULL
  `
  console.log(`✓ Concurso corregidos: ${concursoMal.length}`)
}

// ── Ejecutar 2 ────────────────────────────────────────────────────────────────
const plantillaPorPrefijo = new Map<string, string>()
let cargosCreados = 0
for (const f of noExiste) {
  const prefijo = f.codigo.split('-').slice(0, -1).join('-')
  if (!plantillaPorPrefijo.has(prefijo)) {
    const [p] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM cargos WHERE deleted_at IS NULL AND codigo LIKE ${prefijo + '-%'} LIMIT 1
    `
    if (!p) { console.warn(`  ✗ Sin plantilla para ${prefijo}`); continue }
    plantillaPorPrefijo.set(prefijo, p.id)
  }
  await prisma.$executeRaw`
    INSERT INTO cargos (
      id, hospital_id, escalafon_id, puesto_cargo_id,
      codigo_registro_id, especialidad_puesto_id,
      literal_puesto, especialidad_legacy, regimen,
      codigo, estado, sub_estado, origen, created_at, updated_at
    )
    SELECT gen_random_uuid(), hospital_id, escalafon_id, puesto_cargo_id,
      codigo_registro_id, especialidad_puesto_id,
      literal_puesto, especialidad_legacy, regimen,
      ${f.codigo}, 'vigente', 'vacante', 'padron', now(), now()
    FROM cargos WHERE id = ${plantillaPorPrefijo.get(prefijo)}::uuid
  `
  cargosCreados++
}
console.log(`✓ Cargos creados: ${cargosCreados}`)

// ── Ejecutar 3 ────────────────────────────────────────────────────────────────
if (sinOcupCodigos.length) {
  await prisma.$executeRaw`
    UPDATE cargos SET sub_estado = 'vacante', updated_at = now()
    WHERE codigo = ANY(${sinOcupCodigos}::text[]) AND deleted_at IS NULL
  `
  console.log(`✓ Sub_estado vacante corregido: ${sinOcupCodigos.length}`)
}

await prisma.$disconnect()
