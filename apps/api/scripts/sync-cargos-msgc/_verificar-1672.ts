/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const ocupActivas = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL AND c.estado = 'vigente'
`
const ocupPorCodigo = new Map<string, Set<string>>()
for (const o of ocupActivas) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!ocupPorCodigo.has(o.codigo)) ocupPorCodigo.set(o.codigo, new Set())
  ocupPorCodigo.get(o.codigo)!.add(corto)
}

const cargos = await prisma.$queryRaw<{ codigo: string; estado: string; sub_estado: string | null }[]>`
  SELECT codigo, estado, sub_estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  return !(ocupPorCodigo.get(f.codigo)?.has(f.sial_rol_corto))
})

// Distribución de estado/sub_estado de esos cargos en sistema
const dist = new Map<string, number>()
for (const f of sinOcup) {
  const c = cargoPorCodigo.get(f.codigo)
  const key = c ? `${c.estado} / ${c.sub_estado ?? 'NULL'}` : 'NO EXISTE'
  dist.set(key, (dist.get(key) ?? 0) + 1)
}

console.log(`\nTotal sin ocupación activa: ${sinOcup.length}`)
console.log('\nEstado en sistema:')
for (const [k, v] of [...dist.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${v.toString().padStart(5)}  ${k}`)

await prisma.$disconnect()
