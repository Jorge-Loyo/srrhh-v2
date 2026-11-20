/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const cargos = await prisma.$queryRaw<{ codigo: string; estado: string; sub_estado: string | null }[]>`
  SELECT codigo, estado, sub_estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

const ocupActivas = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL
`
const ocupPorCodigo = new Map<string, Set<string>>()
for (const o of ocupActivas) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!ocupPorCodigo.has(o.codigo)) ocupPorCodigo.set(o.codigo, new Set())
  ocupPorCodigo.get(o.codigo)!.add(corto)
}

// ── 1. Sin ocupación activa: clasificar causa ─────────────────────────────────
const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  const c = cargoPorCodigo.get(f.codigo)
  if (!c) return false
  return !(ocupPorCodigo.get(f.codigo)?.has(f.sial_rol_corto))
})

// ¿Tiene alguna ocupación activa (de otra persona)?
let sinNinguna = 0, conOtra = 0
for (const f of sinOcup) {
  const ocups = ocupPorCodigo.get(f.codigo)
  if (!ocups || ocups.size === 0) sinNinguna++
  else conOtra++
}
console.log(`\n── Sin ocupación activa: ${sinOcup.length}`)
console.log(`  Sin ninguna ocupación:        ${sinNinguna}`)
console.log(`  Con ocupación de otra persona: ${conOtra}`)

// ── 2. Concurso con sub_estado=ocupado: ¿tienen persona activa? ───────────────
const concursoOcupado = mapaExcel.filter(f => {
  const c = cargoPorCodigo.get(f.codigo)
  return f.bloque === 'Concurso' && c?.sub_estado === 'ocupado'
})
console.log(`\n── Concurso/ocupado: ${concursoOcupado.length}`)
let conPersona = 0, sinPersona = 0
for (const f of concursoOcupado) {
  const ocups = ocupPorCodigo.get(f.codigo)
  if (ocups && ocups.size > 0) conPersona++
  else sinPersona++
}
console.log(`  Con persona activa (vigente/ocupado): ${conPersona}`)
console.log(`  Sin persona activa (→ concurso):      ${sinPersona}`)

// ── 3. Códigos no existentes ──────────────────────────────────────────────────
const noExiste = mapaExcel.filter(f => !cargoPorCodigo.has(f.codigo))
console.log(`\n── Códigos no existentes: ${noExiste.length}`)
const porPrefijo = new Map<string, number>()
for (const f of noExiste) {
  const p = f.codigo.split('-').slice(0, -1).join('-')
  porPrefijo.set(p, (porPrefijo.get(p) ?? 0) + 1)
}
for (const [p, cnt] of [...porPrefijo.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${cnt.toString().padStart(4)}  ${p}  [bloque: ${noExiste.find(f => f.codigo.startsWith(p+'-'))?.bloque}]`)

await prisma.$disconnect()
