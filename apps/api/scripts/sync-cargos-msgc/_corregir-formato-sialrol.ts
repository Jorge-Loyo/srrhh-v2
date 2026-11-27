/* eslint-disable no-console */
import * as readline from 'node:readline'
import { PrismaClient } from '@prisma/client'
import { extraerIdSialRol, extraerIdSial } from '../../src/shared/sialRol'

const prisma = new PrismaClient()

// ── Diagnóstico: formatos actuales ────────────────────────────────────────────
const formatos = await prisma.$queryRaw<{ formato: string; cantidad: bigint; ejemplo: string }[]>`
  SELECT
    CASE
      WHEN array_length(string_to_array(id_sial_rol, '-'), 1) = 2 THEN 'corto'
      WHEN array_length(string_to_array(id_sial_rol, '-'), 1) = 4 THEN 'largo'
      ELSE 'otro'
    END AS formato,
    COUNT(*)::bigint AS cantidad,
    MIN(id_sial_rol) AS ejemplo
  FROM ocupaciones
  GROUP BY 1 ORDER BY 2 DESC
`

console.log('\n── Formatos actuales en ocupaciones ─────────────────────────────────────────\n')
for (const f of formatos) {
  console.log(`  ${f.formato}: ${f.cantidad}  (ej: ${f.ejemplo})`)
}

// ── Ocupaciones con formato largo ─────────────────────────────────────────────
const largas = await prisma.$queryRaw<{ id: string; id_sial_rol: string }[]>`
  SELECT id::text, id_sial_rol FROM ocupaciones
  WHERE array_length(string_to_array(id_sial_rol, '-'), 1) = 4
`

if (largas.length === 0) {
  console.log('\n  No hay ocupaciones con formato largo. Nada que corregir.')
  await prisma.$disconnect()
  process.exit(0)
}

// Construir correcciones: largo → corto
type Correccion = { id: string; viejo: string; nuevo: string }
const correcciones: Correccion[] = []
const conflictos: string[] = []

// Verificar que el id_sial_rol corto no exista ya en otra ocupación
const cortos = largas.map(o => extraerIdSialRol(o.id_sial_rol))
const existentes = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT id_sial_rol FROM ocupaciones
  WHERE id_sial_rol = ANY(${cortos}::text[])
    AND array_length(string_to_array(id_sial_rol, '-'), 1) = 2
`
const existentesSet = new Set(existentes.map(e => e.id_sial_rol))

for (const o of largas) {
  const nuevo = extraerIdSialRol(o.id_sial_rol)
  if (existentesSet.has(nuevo)) {
    conflictos.push(`  CONFLICTO: ${o.id_sial_rol} → ${nuevo} ya existe en otra ocupación`)
  } else {
    correcciones.push({ id: o.id, viejo: o.id_sial_rol, nuevo })
  }
}

console.log(`\n── Preview correcciones (${correcciones.length}) ────────────────────────────────────────\n`)
for (const c of correcciones.slice(0, 10)) {
  console.log(`  ${c.viejo} → ${c.nuevo}`)
}
if (correcciones.length > 10) console.log(`  ... y ${correcciones.length - 10} más`)

if (conflictos.length) {
  console.log(`\n── Conflictos (${conflictos.length}) — NO se corregirán ────────────────────────────`)
  for (const c of conflictos) console.log(c)
}

// personas no tiene id_sial — ese campo vive en cargos
// Actualizar cargos.id_sial desde dim_puestos donde esté NULL
const cargosConCodigo = await prisma.$queryRaw<{ id: string; codigo: string; id_sial: string | null }[]>`
  SELECT id::text, codigo, id_sial FROM cargos
  WHERE deleted_at IS NULL AND codigo IS NOT NULL AND id_sial IS NULL
`

// Obtener id_sial desde dim_puestos via el código de cargo
const codigosCargos = cargosConCodigo.map(c => c.codigo)
const dimPorCodigo = await prisma.$queryRaw<{ codigo_cargo: string; id_sial: string }[]>`
  SELECT DISTINCT ON (dc.codigo_cargo) dc.codigo_cargo, dp.id_sial
  FROM dim_cargos dc
  JOIN dim_puestos dp ON split_part(dp.id_sial_rol, '-', 1) || '-' || split_part(dp.id_sial_rol, '-', 2)
    = split_part(dc.codigo_cargo, '-', 1) || '-' || split_part(dc.codigo_cargo, '-', 2)
  WHERE dc.codigo_cargo = ANY(${codigosCargos}::text[]) AND dp.id_sial IS NOT NULL
  ORDER BY dc.codigo_cargo, dp.puesto_desde DESC NULLS LAST
  LIMIT 100
`
const dimSialPorCodigo = new Map(dimPorCodigo.map(d => [d.codigo_cargo, d.id_sial]))

const actualizarSial = cargosConCodigo
  .filter(c => dimSialPorCodigo.has(c.codigo))
  .map(c => ({ id: c.id, codigo: c.codigo, idSial: dimSialPorCodigo.get(c.codigo)! }))

console.log(`\n── cargos.id_sial a completar: ${actualizarSial.length} ────────────────────────────────\n`)
for (const c of actualizarSial.slice(0, 5)) {
  console.log(`  cargo=${c.codigo} → id_sial=${c.idSial}`)
}
if (actualizarSial.length > 5) console.log(`  ... y ${actualizarSial.length - 5} más`)

// ── Confirmación ──────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ok = await new Promise<boolean>(res =>
  rl.question(`\n¿Aplicar ${correcciones.length} correcciones + eliminar ${conflictos.length} duplicados largos + ${actualizarSial.length} id_sial en cargos? (s/N): `,
    a => { rl.close(); res(a.trim().toLowerCase() === 's') })
)
if (!ok) { console.log('Cancelado.'); await prisma.$disconnect(); process.exit(0) }

// ── Renombrar los que no tienen conflicto ─────────────────────────────────────
let corregidas = 0
let saltadas = 0
for (const c of correcciones) {
  try {
    await prisma.$executeRaw`
      UPDATE ocupaciones SET id_sial_rol = ${c.nuevo}, updated_at = now()
      WHERE id = ${c.id}::uuid
    `
    corregidas++
  } catch {
    saltadas++
  }
  if ((corregidas + saltadas) % 100 === 0) process.stdout.write('.')
}

// ── Eliminar los duplicados largos (el corto ya existe) ───────────────────────
// Los conflictos son ocupaciones con formato largo cuyo corto ya existe.
// La versión corta es la correcta — eliminar la larga.
const idsConflicto = largas
  .filter(o => existentesSet.has(extraerIdSialRol(o.id_sial_rol)))
  .map(o => o.id)

let eliminadas = 0
if (idsConflicto.length > 0) {
  await prisma.$executeRaw`
    DELETE FROM ocupaciones WHERE id = ANY(${idsConflicto}::uuid[])
  `
  eliminadas = idsConflicto.length
}

// ── Actualizar cargos.id_sial ─────────────────────────────────────────────────
let sialesActualizados = 0
for (const c of actualizarSial) {
  await prisma.$executeRaw`
    UPDATE cargos SET id_sial = ${c.idSial} WHERE id = ${c.id}::uuid AND id_sial IS NULL
  `
  sialesActualizados++
}

console.log(`\n── Resultado ────────────────────────────────────────────────────────────────`)
console.log(`  id_sial_rol corregidos (largo->corto): ${corregidas}`)
  if (saltadas) console.log(`  saltados por conflicto inesperado:    ${saltadas}`)
console.log(`  duplicados largos eliminados:         ${eliminadas}`)
console.log(`  cargos.id_sial completados:           ${sialesActualizados}`)

await prisma.$disconnect()
