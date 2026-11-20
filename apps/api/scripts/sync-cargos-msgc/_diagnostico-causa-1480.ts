/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const ocupActivas = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL AND c.estado = 'vigente'
`
const ocupActivasSial = new Set(ocupActivas.map(o => o.id_sial_rol.split('-').slice(0, 2).join('-')))

const cargoPorCodigo = new Map(
  (await prisma.$queryRaw<{ codigo: string; estado: string }[]>`
    SELECT codigo, estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
  `).map(c => [c.codigo, c])
)

const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  const c = cargoPorCodigo.get(f.codigo)
  if (!c || c.estado !== 'vigente') return false
  return !ocupActivasSial.has(f.sial_rol_corto)
})

const sialRoles = sinOcup.map(f => f.sial_rol_corto)

// ¿Existieron alguna vez en ocupaciones (cerradas)?
const cerradas = await prisma.$queryRaw<{ id_sial_rol: string; hasta: Date; cargo_codigo: string }[]>`
  SELECT o.id_sial_rol, o.hasta, c.codigo AS cargo_codigo
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NOT NULL
    AND split_part(o.id_sial_rol, '-', 1) || '-' || split_part(o.id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
  ORDER BY o.hasta DESC
`
const cerradasPorSial = new Map<string, typeof cerradas[0]>()
for (const c of cerradas) {
  const corto = c.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!cerradasPorSial.has(corto)) cerradasPorSial.set(corto, c)
}

// ¿La persona existe en tabla personas?
const cuils = await prisma.$queryRaw<{ cuil: string }[]>`
  SELECT dp.cuil FROM dim_puestos dp
  WHERE split_part(dp.id_sial_rol, '-', 1) || '-' || split_part(dp.id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
    AND dp.puesto_hasta IS NULL AND dp.cuil IS NOT NULL
`
const cuilsSet = new Set(cuils.map(c => c.cuil))
const personasExisten = await prisma.$queryRaw<{ cuil: string }[]>`
  SELECT cuil FROM personas WHERE cuil = ANY(${[...cuilsSet]}::text[])
`
const personasExistenSet = new Set(personasExisten.map(p => p.cuil))

let cerradaPorError = 0, nuncaImportada = 0, sinPersona = 0
for (const f of sinOcup) {
  if (cerradasPorSial.has(f.sial_rol_corto)) { cerradaPorError++; continue }
  // Ver si tiene cuil en dim_puestos
  const dimRegistro = cuils.find(c => {
    // aproximación: no tenemos el mapeo directo aquí, contamos los que tienen persona
  })
  nuncaImportada++
}

console.log(`Total sin ocupación activa (vigentes): ${sinOcup.length}`)
console.log(`\nCausa:`)
console.log(`  Existió pero fue cerrada (posible error): ${cerradaPorError}`)
console.log(`  Nunca importada al sistema:               ${sinOcup.length - cerradaPorError}`)
console.log(`\nPersonas en tabla personas: ${personasExistenSet.size} de ${cuilsSet.size} CUILs`)

// Muestra de cerradas por error
if (cerradaPorError > 0) {
  console.log('\nEjemplos cerradas:')
  let n = 0
  for (const f of sinOcup) {
    const c = cerradasPorSial.get(f.sial_rol_corto)
    if (c) {
      console.log(`  ${f.sial_rol_corto} → ${f.codigo}: cerrada el ${c.hasta.toISOString().slice(0,10)} (estaba en ${c.cargo_codigo})`)
      if (++n >= 5) break
    }
  }
}

await prisma.$disconnect()
