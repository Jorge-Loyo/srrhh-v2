/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { sialRolCorto } from '../../src/shared/sialRol'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const ocupActivas = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT o.id_sial_rol FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL AND c.estado = 'vigente'
`
const ocupActivasSial = new Set(ocupActivas.map(o => sialRolCorto(o.id_sial_rol)))

const cargos = await prisma.$queryRaw<{ codigo: string }[]>`
  SELECT codigo FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL AND estado = 'vigente'
`
const codigosVigentes = new Set(cargos.map(c => c.codigo))

const sinOcup = mapaExcel.filter(f =>
  f.bloque === 'Dotación' && f.sial_rol_corto &&
  codigosVigentes.has(f.codigo) && !ocupActivasSial.has(f.sial_rol_corto)
)
const sialRoles = sinOcup.map(f => f.sial_rol_corto)

const enDim = await prisma.$queryRaw<{
  id_sial_rol: string; cuil: string | null
}[]>`
  SELECT id_sial_rol, cuil FROM dim_puestos
  WHERE split_part(id_sial_rol, '-', 1) || '-' || split_part(id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
    AND puesto_hasta IS NULL
`
const dimPorSial = new Map(enDim.map(d => [sialRolCorto(d.id_sial_rol), d]))

const grupo2 = sinOcup.filter(f => dimPorSial.has(f.sial_rol_corto))

const cuils = [...new Set(grupo2.map(f => dimPorSial.get(f.sial_rol_corto)?.cuil).filter(Boolean))] as string[]
const personas = await prisma.$queryRaw<{ id: string; cuil: string; apellido_nombre: string }[]>`
  SELECT id::text, cuil, apellido_nombre FROM personas WHERE cuil = ANY(${cuils}::text[])
`
const personaPorCuil = new Map(personas.map(p => [p.cuil, p]))

// También buscar por cuil del Excel (sial_rol_corto → cuil del Excel)
// El Excel tiene el cuil en sial_rol_corto? No — buscar en dim_puestos el cuil
// Necesitamos saber si la persona se encontró por cuil de dim_puestos o no

let coinciden = 0
let discrepan = 0

console.log('\n── Verificación de CUILs ────────────────────────────────────────────────────\n')
console.log('  Formato: sial_corto | cuil_dim_puestos | cuil_persona_encontrada | ¿coincide?')
console.log('  ─────────────────────────────────────────────────────────────────────────')

for (const f of grupo2) {
  const dim = dimPorSial.get(f.sial_rol_corto)!
  const cuilDim = dim.cuil ?? '?'

  // La persona se buscó por cuil de dim_puestos
  const persona = dim.cuil ? personaPorCuil.get(dim.cuil) : null

  // El id_sial_rol largo usa el cuil de dim_puestos (4ta parte del id_sial_rol original)
  const cuilEnIdSialRol = dim.id_sial_rol.split('-')[2] ?? '?'

  const ok = cuilDim === cuilEnIdSialRol ? '✓' : '⚠ DISCREPANCIA'

  if (cuilDim === cuilEnIdSialRol) coinciden++
  else discrepan++

  if (cuilDim !== cuilEnIdSialRol) {
    console.log(`  ${f.sial_rol_corto}`)
    console.log(`    cuil en dim_puestos.cuil:      ${cuilDim}`)
    console.log(`    cuil en dim_puestos.id_sial_rol: ${cuilEnIdSialRol}`)
    console.log(`    persona encontrada:            ${persona?.apellido_nombre ?? 'NO ENCONTRADA'}`)
    console.log(`    ${ok}`)
  }
}

console.log(`\n  Coinciden (cuil_dim == cuil_en_id_sial_rol): ${coinciden}`)
console.log(`  Discrepan:                                   ${discrepan}`)
console.log('\n── Resumen de personas encontradas ──────────────────────────────────────────')
let conPersona = 0, sinPersona = 0
for (const f of grupo2) {
  const dim = dimPorSial.get(f.sial_rol_corto)!
  // Buscar persona por cuil del id_sial_rol (más confiable para construir el largo)
  const cuilIdSialRol = dim.id_sial_rol.split('-')[2]
  const personaPorIdSial = cuilIdSialRol ? personaPorCuil.get(cuilIdSialRol) : null
  const personaPorDim = dim.cuil ? personaPorCuil.get(dim.cuil) : null
  if (personaPorIdSial || personaPorDim) conPersona++
  else { sinPersona++; console.log(`  SIN PERSONA: ${f.sial_rol_corto} cuil_dim=${dim.cuil} cuil_id=${cuilIdSialRol}`) }
}
console.log(`  Con persona: ${conPersona} / Sin persona: ${sinPersona}`)

await prisma.$disconnect()
