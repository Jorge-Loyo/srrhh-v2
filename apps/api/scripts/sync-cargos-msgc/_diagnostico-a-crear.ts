/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const cargos = await prisma.$queryRaw<{ codigo: string }[]>`
  SELECT codigo FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
`
const codigosEnSistema = new Set(cargos.map(c => c.codigo))

// Códigos a crear: NO EXISTE en sistema, en bloques que requieren creación
const aCrear = mapaExcel.filter(f =>
  !codigosEnSistema.has(f.codigo) &&
  (f.estado === 'En validación' || f.bloque === 'Concurso' || f.bloque === 'Nunca levantado')
)

console.log(`\nTotal a crear: ${aCrear.length}`)

// Por bloque
const porBloque = new Map<string, number>()
for (const f of aCrear) porBloque.set(f.bloque, (porBloque.get(f.bloque) ?? 0) + 1)
console.log('Por bloque:')
for (const [b, cnt] of [...porBloque.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${cnt.toString().padStart(5)}  ${b}`)

// Por prefijo
const porPrefijo = new Map<string, number>()
for (const f of aCrear) {
  const prefijo = f.codigo.split('-').slice(0, -1).join('-')
  porPrefijo.set(prefijo, (porPrefijo.get(prefijo) ?? 0) + 1)
}
console.log('\nPor prefijo:')
for (const [p, cnt] of [...porPrefijo.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${cnt.toString().padStart(5)}  ${p}`)

// ¿Hay cargos del mismo prefijo en el sistema para clonar atributos?
console.log('\nVerificando si hay cargos del mismo prefijo en sistema:')
for (const [prefijo] of [...porPrefijo.entries()].sort((a, b) => b[1] - a[1])) {
  const [ejemplo] = await prisma.$queryRaw<{ id: string; codigo: string }[]>`
    SELECT id::text, codigo FROM cargos
    WHERE deleted_at IS NULL AND codigo LIKE ${prefijo + '-%'}
    LIMIT 1
  `
  console.log(`  ${prefijo}: ${ejemplo ? `✓ ejemplo=${ejemplo.codigo}` : '✗ SIN ejemplos en sistema'}`)
}

await prisma.$disconnect()
