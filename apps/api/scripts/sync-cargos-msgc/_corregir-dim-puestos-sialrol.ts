/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Diagnóstico ───────────────────────────────────────────────────────────────
const formatos = await prisma.$queryRaw<{ largo: number; cantidad: number; ejemplo: string }[]>`
  SELECT LENGTH(id_sial_rol) as largo, COUNT(*)::int as cantidad, MIN(id_sial_rol) as ejemplo
  FROM dim_puestos GROUP BY 1 ORDER BY 1
`
console.log('\n── Formatos actuales en dim_puestos ─────────────────────────────────────────\n')
for (const f of formatos) {
  const alerta = f.largo > 12 ? ' ⚠️' : ''
  console.log(`  largo=${f.largo}: ${f.cantidad}  (ej: ${f.ejemplo})${alerta}`)
}

// ── Obtener todos los largos (> 12 chars = formato largo con cuil) ─────────────
const largas = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT id_sial_rol FROM dim_puestos WHERE LENGTH(id_sial_rol) > 12
`

if (largas.length === 0) {
  console.log('\n  No hay registros con formato largo. Nada que corregir.')
  await prisma.$disconnect()
  process.exit(0)
}

// Extraer formato corto: primeras 2 partes separadas por '-'
function aCorto(valor: string): string {
  const partes = valor.split('-')
  return `${partes[0]}-${partes[1]}`
}

// Verificar cuáles cortos ya existen en dim_puestos
const cortos = largas.map(r => aCorto(r.id_sial_rol))
const existentes = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT id_sial_rol FROM dim_puestos
  WHERE id_sial_rol = ANY(${cortos}::text[])
    AND LENGTH(id_sial_rol) <= 12
`
const existentesSet = new Set(existentes.map(e => e.id_sial_rol))

const aRenombrar: { viejo: string; nuevo: string }[] = []
const aEliminar: string[] = []

for (const r of largas) {
  const nuevo = aCorto(r.id_sial_rol)
  if (existentesSet.has(nuevo)) {
    aEliminar.push(r.id_sial_rol)
  } else {
    aRenombrar.push({ viejo: r.id_sial_rol, nuevo })
  }
}

console.log(`\n── Preview ───────────────────────────────────────────────────────────────────`)
console.log(`  A renombrar (largo→corto): ${aRenombrar.length}`)
for (const r of aRenombrar.slice(0, 5)) console.log(`    ${r.viejo} → ${r.nuevo}`)
if (aRenombrar.length > 5) console.log(`    ... y ${aRenombrar.length - 5} más`)

console.log(`  A eliminar (corto ya existe): ${aEliminar.length}`)
for (const v of aEliminar.slice(0, 5)) console.log(`    ${v}`)
if (aEliminar.length > 5) console.log(`    ... y ${aEliminar.length - 5} más`)

// ── Confirmación ──────────────────────────────────────────────────────────────
import * as readline from 'node:readline'
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ok = await new Promise<boolean>(res =>
  rl.question(`\n¿Aplicar ${aRenombrar.length} renombrados + ${aEliminar.length} eliminaciones? (s/N): `,
    a => { rl.close(); res(a.trim().toLowerCase() === 's') })
)
if (!ok) { console.log('Cancelado.'); await prisma.$disconnect(); process.exit(0) }

// ── Eliminar duplicados largos primero (el corto ya existe) ───────────────────
if (aEliminar.length > 0) {
  await prisma.$executeRaw`
    DELETE FROM dim_puestos WHERE id_sial_rol = ANY(${aEliminar}::text[])
  `
  console.log(`  ✓ ${aEliminar.length} eliminados`)
}

// ── Renombrar los que no tienen conflicto ─────────────────────────────────────
// dim_puestos usa id_sial_rol como PK — hay que hacer DELETE + INSERT para cambiar la PK
// Lo hacemos en lotes para no saturar
let renombrados = 0
let saltados = 0
const LOTE = 500

for (let i = 0; i < aRenombrar.length; i += LOTE) {
  const lote = aRenombrar.slice(i, i + LOTE)
  for (const r of lote) {
    try {
      await prisma.$executeRaw`
        UPDATE dim_puestos SET id_sial_rol = ${r.nuevo} WHERE id_sial_rol = ${r.viejo}
      `
      renombrados++
    } catch {
      saltados++
    }
  }
  process.stdout.write('.')
}

console.log(`\n\n── Resultado ────────────────────────────────────────────────────────────────`)
console.log(`  renombrados (largo→corto): ${renombrados}`)
console.log(`  eliminados (corto ya existía): ${aEliminar.length}`)
if (saltados) console.log(`  saltados por conflicto inesperado: ${saltados}`)

// Verificación final
const final = await prisma.$queryRaw<{ largo: number; cantidad: number }[]>`
  SELECT LENGTH(id_sial_rol) as largo, COUNT(*)::int as cantidad
  FROM dim_puestos GROUP BY 1 ORDER BY 1
`
console.log('\nDistribución final:')
for (const f of final) console.log(`  largo=${f.largo}: ${f.cantidad}`)

await prisma.$disconnect()
