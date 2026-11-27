/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import * as readline from 'node:readline'
import { PrismaClient } from '@prisma/client'
import { extraerIdSialRol } from '../../src/shared/sialRol'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

// ── Reproducir la misma lógica de sinOcup que _detalle-grupos-74 ─────────────
const ocupActivas = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT o.id_sial_rol FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL AND c.estado = 'vigente'
`
const ocupActivasSial = new Set(ocupActivas.map(o => extraerIdSialRol(o.id_sial_rol)))

const cargos = await prisma.$queryRaw<{ id: string; codigo: string }[]>`
  SELECT id::text, codigo FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL AND estado = 'vigente'
`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c.id]))

const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  if (!cargoPorCodigo.has(f.codigo)) return false
  return !ocupActivasSial.has(f.sial_rol_corto)
})

const sialRoles = sinOcup.map(f => f.sial_rol_corto)

// ── Obtener datos de dim_puestos ──────────────────────────────────────────────
const enDim = await prisma.$queryRaw<{
  id_sial_rol: string; cuil: string | null; situacion_revista: string | null
  puesto_desde: Date | null
}[]>`
  SELECT id_sial_rol, cuil, situacion_revista, puesto_desde
  FROM dim_puestos
  WHERE split_part(id_sial_rol, '-', 1) || '-' || split_part(id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
    AND puesto_hasta IS NULL
`
const dimPorSial = new Map(enDim.map(d => [extraerIdSialRol(d.id_sial_rol), d]))

// ── Grupo 2: los que tienen dim_puestos activo ────────────────────────────────
const cerradasSials = new Set<string>() // grupo 1 vacío según diagnóstico
const grupo2 = sinOcup.filter(f => dimPorSial.has(f.sial_rol_corto) && !cerradasSials.has(f.sial_rol_corto))

if (grupo2.length === 0) {
  console.log('No hay casos en grupo 2. Nada que hacer.')
  await prisma.$disconnect()
  process.exit(0)
}

// ── Obtener personas ──────────────────────────────────────────────────────────
const cuils = [...new Set(grupo2.map(f => dimPorSial.get(f.sial_rol_corto)?.cuil).filter(Boolean))] as string[]
const personas = await prisma.$queryRaw<{ id: string; cuil: string; apellido_nombre: string }[]>`
  SELECT id::text, cuil, apellido_nombre FROM personas WHERE cuil = ANY(${cuils}::text[])
`
const personaPorCuil = new Map(personas.map(p => [p.cuil, p]))

// ── Construir registros a insertar ────────────────────────────────────────────
type Registro = {
  sialCorto: string
  idSialRol: string
  cargoId: string
  personaId: string
  cuil: string
  apellidoNombre: string
  situacionRevista: string | null
  desde: Date | null
  codigo: string
}

const registros: Registro[] = []
const errores: string[] = []

for (const f of grupo2) {
  const dim = dimPorSial.get(f.sial_rol_corto)!
  const cargoId = cargoPorCodigo.get(f.codigo)
  const persona = dim.cuil ? personaPorCuil.get(dim.cuil) : null

  if (!cargoId) { errores.push(`${f.sial_rol_corto}: cargo ${f.codigo} no encontrado`); continue }
  if (!persona) { errores.push(`${f.sial_rol_corto}: persona cuil=${dim.cuil} no encontrada`); continue }

  // id_sial_rol = idSial-rol (formato corto, sin cuil)
  const idSialRolLargo = extraerIdSialRol(dim.id_sial_rol) || f.sial_rol_corto

  registros.push({
    sialCorto: f.sial_rol_corto,
    idSialRol: idSialRolLargo,
    cargoId,
    personaId: persona.id,
    cuil: persona.cuil,
    apellidoNombre: persona.apellido_nombre,
    situacionRevista: dim.situacion_revista,
    desde: dim.puesto_desde,
    codigo: f.codigo,
  })
}

// ── Preview ───────────────────────────────────────────────────────────────────
console.log(`\n── Preview: ${registros.length} ocupaciones a crear ─────────────────────────\n`)
for (const r of registros) {
  console.log(`  ${r.sialCorto} → ${r.codigo}`)
  console.log(`    persona:      ${r.apellidoNombre} (${r.cuil})`)
  console.log(`    id_sial_rol:  ${r.idSialRol}`)
  console.log(`    sit_revista:  ${r.situacionRevista ?? '?'}`)
  console.log(`    desde:        ${r.desde?.toISOString().slice(0, 10) ?? 'NULL'}`)
}

if (errores.length) {
  console.log(`\n── Errores (${errores.length}) ──────────────────────────────────────────────`)
  for (const e of errores) console.log(`  ⚠ ${e}`)
}

// ── Confirmación ──────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ok = await new Promise<boolean>(res => rl.question('\n¿Confirmar creación? (s/N): ', a => { rl.close(); res(a.trim().toLowerCase() === 's') }))

if (!ok) { console.log('Cancelado.'); await prisma.$disconnect(); process.exit(0) }

// ── Insertar ──────────────────────────────────────────────────────────────────
let creadas = 0
let yaExistian = 0

for (const r of registros) {
  // Verificar que el id_sial_rol no exista ya
  const existe = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM ocupaciones WHERE id_sial_rol = ${r.idSialRol}
  `
  if (existe[0].count > 0n) {
    console.log(`  SKIP (ya existe): ${r.idSialRolLargo}`)
    yaExistian++
    continue
  }

  await prisma.$executeRaw`
    INSERT INTO ocupaciones (id, persona_id, cargo_id, id_sial_rol, cuil, situacion_revista, desde, hasta, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      ${r.personaId}::uuid,
      ${r.cargoId}::uuid,
      ${r.idSialRol},
      ${r.cuil},
      ${r.situacionRevista},
      ${r.desde},
      NULL,
      now(), now()
    )
  `

  // Actualizar sub_estado del cargo a ocupado
  await prisma.$executeRaw`
    UPDATE cargos SET sub_estado = 'ocupado', updated_at = now()
    WHERE id = ${r.cargoId}::uuid AND estado = 'vigente'
  `

  console.log(`  ✓ ${r.sialCorto} → ${r.apellidoNombre}`)
  creadas++
}

console.log(`\n── Resultado ────────────────────────────────────────────────────────────────`)
console.log(`  Creadas:     ${creadas}`)
console.log(`  Ya existían: ${yaExistian}`)
console.log(`  Errores:     ${errores.length}`)

await prisma.$disconnect()
