/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const cargos = await prisma.$queryRaw<{ codigo: string; id: string }[]>`
  SELECT codigo, id::text FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

// Ocupaciones activas
const ocupActivas = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL
`
const ocupActivasPorCodigo = new Map<string, Set<string>>()
for (const o of ocupActivas) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!ocupActivasPorCodigo.has(o.codigo)) ocupActivasPorCodigo.set(o.codigo, new Set())
  ocupActivasPorCodigo.get(o.codigo)!.add(corto)
}

// Todas las ocupaciones (incluyendo cerradas) por sial_rol_corto
const todasOcup = await prisma.$queryRaw<{
  id_sial_rol: string; cargo_codigo: string; hasta: Date | null; cargo_id: string
}[]>`
  SELECT o.id_sial_rol, c.codigo AS cargo_codigo, o.hasta, o.cargo_id::text
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE c.deleted_at IS NULL
`
// sial_rol_corto → lista de ocupaciones (activas y cerradas)
const todasPorSial = new Map<string, typeof todasOcup>()
for (const o of todasOcup) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  const lista = todasPorSial.get(corto) ?? []
  lista.push(o)
  todasPorSial.set(corto, lista)
}

// Identificar los 4806
const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  const cargo = cargoPorCodigo.get(f.codigo)
  if (!cargo) return false
  const ocups = ocupActivasPorCodigo.get(f.codigo)
  return !ocups || !ocups.has(f.sial_rol_corto)
})

console.log(`\nTotal sin ocupación activa: ${sinOcup.length}`)

let noExiste = 0, cerrada = 0, enOtroCargo = 0, cerradaEnOtroCargo = 0

const ejemplosCerrada: string[] = []
const ejemplosOtroCargo: string[] = []

for (const f of sinOcup) {
  const ocupaciones = todasPorSial.get(f.sial_rol_corto) ?? []

  if (ocupaciones.length === 0) {
    noExiste++
    continue
  }

  const activa = ocupaciones.find(o => !o.hasta)
  const cerradaOcup = ocupaciones.find(o => o.hasta)

  if (activa) {
    // Existe activa pero en otro cargo
    enOtroCargo++
    if (ejemplosOtroCargo.length < 5)
      ejemplosOtroCargo.push(`  ${f.codigo} (excel) ← sial=${f.sial_rol_corto} está en cargo ${activa.cargo_codigo}`)
  } else if (cerradaOcup) {
    // Solo existe cerrada
    if (cerradaOcup.cargo_codigo === f.codigo) {
      cerrada++
      if (ejemplosCerrada.length < 5)
        ejemplosCerrada.push(`  ${f.codigo}: cerrada el ${cerradaOcup.hasta?.toISOString().slice(0,10)}`)
    } else {
      cerradaEnOtroCargo++
    }
  }
}

console.log(`\nClasificación:`)
console.log(`  No existe en ningún lado:          ${noExiste}`)
console.log(`  Existe activa en OTRO cargo:       ${enOtroCargo}`)
console.log(`  Existe cerrada en este cargo:      ${cerrada}`)
console.log(`  Existe cerrada en otro cargo:      ${cerradaEnOtroCargo}`)

if (ejemplosOtroCargo.length) {
  console.log(`\nEjemplos "activa en otro cargo":`)
  for (const e of ejemplosOtroCargo) console.log(e)
}
if (ejemplosCerrada.length) {
  console.log(`\nEjemplos "cerrada en este cargo":`)
  for (const e of ejemplosCerrada) console.log(e)
}

await prisma.$disconnect()
