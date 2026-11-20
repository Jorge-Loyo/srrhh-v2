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

// ── Grupo 1: ocupaciones cerradas ────────────────────────────────────────────
const cerradas = await prisma.$queryRaw<{
  id: string; id_sial_rol: string; hasta: Date; cargo_codigo: string
  cuil: string | null; situacion_revista: string | null
}[]>`
  SELECT o.id::text, o.id_sial_rol, o.hasta, c.codigo AS cargo_codigo,
    o.cuil, o.situacion_revista
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NOT NULL
    AND split_part(o.id_sial_rol, '-', 1) || '-' || split_part(o.id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
  ORDER BY o.hasta DESC
`
console.log(`\n── Grupo 1: Ocupaciones cerradas (${cerradas.length}) ────────────────────────`)
console.log('  Estado actual → Estado propuesto')
console.log('  ocupacion cerrada (hasta=fecha) → reabrir (hasta=NULL)\n')
for (const c of cerradas) {
  const corto = c.id_sial_rol.split('-').slice(0, 2).join('-')
  const excelFila = sinOcup.find(f => f.sial_rol_corto === corto)
  console.log(`  sial=${corto}`)
  console.log(`    cargo actual:   ${c.cargo_codigo}`)
  console.log(`    cargo excel:    ${excelFila?.codigo}`)
  console.log(`    cerrada el:     ${c.hasta.toISOString().slice(0,10)}`)
  console.log(`    sit_revista:    ${c.situacion_revista}`)
  console.log(`    mismo cargo:    ${c.cargo_codigo === excelFila?.codigo ? 'SÍ ✓' : 'NO — hay que mover también'}`)
}

// ── Grupo 2: dim_puestos activo ───────────────────────────────────────────────
const enDim = await prisma.$queryRaw<{
  id_sial_rol: string; cuil: string | null; situacion_revista: string | null
  puesto_desde: Date | null; literal_puesto: string | null; escalafon: string | null
}[]>`
  SELECT id_sial_rol, cuil, situacion_revista, puesto_desde, literal_puesto, escalafon
  FROM dim_puestos
  WHERE split_part(id_sial_rol, '-', 1) || '-' || split_part(id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
    AND puesto_hasta IS NULL
`
const dimPorSial = new Map(enDim.map(d => [d.id_sial_rol.split('-').slice(0,2).join('-'), d]))
const cerradasSials = new Set(cerradas.map(c => c.id_sial_rol.split('-').slice(0,2).join('-')))

const grupo2 = sinOcup.filter(f => dimPorSial.has(f.sial_rol_corto) && !cerradasSials.has(f.sial_rol_corto))
console.log(`\n── Grupo 2: Crear desde dim_puestos (${grupo2.length}) ──────────────────────`)
console.log('  Estado actual → Estado propuesto')
console.log('  cargo vigente/vacante, sin ocupación → crear ocupación desde dim_puestos\n')

// Verificar cuántos tienen persona en sistema
const cuils2 = [...new Set(grupo2.map(f => dimPorSial.get(f.sial_rol_corto)?.cuil).filter(Boolean))] as string[]
const personas2 = await prisma.$queryRaw<{ cuil: string; apellido_nombre: string }[]>`
  SELECT cuil, apellido_nombre FROM personas WHERE cuil = ANY(${cuils2}::text[])
`
const personasPorCuil = new Map(personas2.map(p => [p.cuil, p]))

let conPersona = 0, sinPersona = 0
for (const f of grupo2.slice(0, 10)) {
  const dim = dimPorSial.get(f.sial_rol_corto)!
  const persona = dim.cuil ? personasPorCuil.get(dim.cuil) : null
  console.log(`  sial=${f.sial_rol_corto} → cargo=${f.codigo}`)
  console.log(`    cuil:         ${dim.cuil ?? '?'}`)
  console.log(`    persona:      ${persona?.apellido_nombre ?? 'NO EXISTE EN SISTEMA'}`)
  console.log(`    sit_revista:  ${dim.situacion_revista}`)
  console.log(`    desde:        ${dim.puesto_desde?.toISOString().slice(0,10) ?? '?'}`)
}
if (grupo2.length > 10) console.log(`  ... y ${grupo2.length - 10} más`)

for (const f of grupo2) {
  const dim = dimPorSial.get(f.sial_rol_corto)!
  if (dim.cuil && personasPorCuil.has(dim.cuil)) conPersona++
  else sinPersona++
}
console.log(`\n  Con persona en sistema: ${conPersona}`)
console.log(`  Sin persona en sistema: ${sinPersona}`)

// ── Grupo 3: sin datos ────────────────────────────────────────────────────────
const grupo3 = sinOcup.filter(f => !dimPorSial.has(f.sial_rol_corto) && !cerradasSials.has(f.sial_rol_corto))
console.log(`\n── Grupo 3: Sin datos en ninguna fuente (${grupo3.length}) ──────────────────`)
console.log('  Estado actual → Estado propuesto')
console.log('  cargo vigente/vacante → exportar a Excel para revisión manual\n')
for (const f of grupo3.slice(0, 10))
  console.log(`  ${f.sial_rol_corto} → ${f.codigo}`)
if (grupo3.length > 10) console.log(`  ... y ${grupo3.length - 10} más`)

await prisma.$disconnect()
