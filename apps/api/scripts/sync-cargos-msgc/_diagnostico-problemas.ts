/* eslint-disable no-console */
// Diagnóstico de los dos grupos grandes de problemas
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const cargos = await prisma.$queryRaw<{
  codigo: string; estado: string; sub_estado: string | null
}[]>`SELECT codigo, estado, sub_estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL`

const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

const ocupaciones = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL
`
const ocupPorCodigo = new Map<string, Set<string>>()
for (const o of ocupaciones) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!ocupPorCodigo.has(o.codigo)) ocupPorCodigo.set(o.codigo, new Set())
  ocupPorCodigo.get(o.codigo)!.add(corto)
}

// ── Grupo A: códigos que no existen en sistema ────────────────────────────────
const faltantes = mapaExcel.filter(f => !cargoPorCodigo.has(f.codigo))
console.log(`\n── A. Códigos no existentes en sistema: ${faltantes.length} ────────────────`)

// Distribución por prefijo
const porPrefijo = new Map<string, number>()
for (const f of faltantes) {
  const prefijo = f.codigo.split('-').slice(0, -1).join('-')
  porPrefijo.set(prefijo, (porPrefijo.get(prefijo) ?? 0) + 1)
}
console.log('Por prefijo:')
for (const [p, cnt] of [...porPrefijo.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cnt.toString().padStart(5)}  ${p}`)
}

// Distribución por bloque
const porBloque = new Map<string, number>()
for (const f of faltantes) {
  porBloque.set(f.bloque, (porBloque.get(f.bloque) ?? 0) + 1)
}
console.log('Por bloque:')
for (const [b, cnt] of [...porBloque.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cnt.toString().padStart(5)}  ${b}`)
}

// Muestra
console.log('Muestra (10):')
for (const f of faltantes.slice(0, 10)) {
  console.log(`  ${f.codigo} [${f.bloque}] sial=${f.sial_rol_corto || '-'}`)
}

// ── Grupo B: sin ocupación activa ─────────────────────────────────────────────
const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  const cargo = cargoPorCodigo.get(f.codigo)
  if (!cargo) return false
  const ocups = ocupPorCodigo.get(f.codigo)
  return !ocups || !ocups.has(f.sial_rol_corto)
})
console.log(`\n── B. Sin ocupación activa: ${sinOcup.length} ────────────────────────────────`)

// ¿El cargo tiene alguna ocupación activa (de otra persona)?
let sinNinguna = 0, conOtra = 0, cargoVacante = 0, cargoNoVigente = 0
for (const f of sinOcup) {
  const cargo = cargoPorCodigo.get(f.codigo)!
  const ocups = ocupPorCodigo.get(f.codigo)
  if (cargo.estado === 'no_vigente') { cargoNoVigente++; continue }
  if (!ocups || ocups.size === 0) {
    if (cargo.sub_estado === 'vacante') cargoVacante++
    else sinNinguna++
  } else {
    conOtra++
  }
}
console.log(`  Cargo no_vigente:          ${cargoNoVigente}`)
console.log(`  Cargo vacante (sub_estado): ${cargoVacante}`)
console.log(`  Sin ninguna ocupación:      ${sinNinguna}`)
console.log(`  Con ocupación de otra persona: ${conOtra}`)

// Muestra de los "con otra persona"
const conOtraEjemplos = sinOcup.filter(f => {
  const ocups = ocupPorCodigo.get(f.codigo)
  return ocups && ocups.size > 0 && !ocups.has(f.sial_rol_corto)
}).slice(0, 5)
if (conOtraEjemplos.length) {
  console.log('  Ejemplos con otra persona:')
  for (const f of conOtraEjemplos) {
    const ocups = [...(ocupPorCodigo.get(f.codigo) ?? [])]
    console.log(`    ${f.codigo}: excel=${f.sial_rol_corto} sistema=${ocups.join(', ')}`)
  }
}

await prisma.$disconnect()
