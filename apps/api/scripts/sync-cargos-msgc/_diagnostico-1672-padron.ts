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

const cargoPorCodigo = new Map(
  (await prisma.$queryRaw<{ codigo: string; estado: string }[]>`
    SELECT codigo, estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
  `).map(c => [c.codigo, c])
)

// Los 1672: Dotación con persona sin ocupación activa
const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  const c = cargoPorCodigo.get(f.codigo)
  if (!c || c.estado !== 'vigente') return false
  return !(ocupPorCodigo.get(f.codigo)?.has(f.sial_rol_corto))
})

console.log(`Sin ocupación activa (vigentes): ${sinOcup.length}`)

// Buscar en dim_puestos por sial_rol_corto (formato largo empieza con sial_rol_corto + '-')
const sialRoles = sinOcup.map(f => f.sial_rol_corto)

const enDimPuestos = await prisma.$queryRaw<{
  id_sial_rol: string; cuil: string | null; puesto_hasta: Date | null
}[]>`
  SELECT id_sial_rol, cuil, puesto_hasta
  FROM dim_puestos
  WHERE split_part(id_sial_rol, '-', 1) || '-' || split_part(id_sial_rol, '-', 2) = ANY(${sialRoles}::text[])
`

// Agrupar por sial_rol_corto
const dimPorSial = new Map<string, typeof enDimPuestos>()
for (const d of enDimPuestos) {
  const corto = d.id_sial_rol.split('-').slice(0, 2).join('-')
  const lista = dimPorSial.get(corto) ?? []
  lista.push(d)
  dimPorSial.set(corto, lista)
}

let conActivo = 0, soloHistorico = 0, sinDatos = 0
for (const f of sinOcup) {
  const registros = dimPorSial.get(f.sial_rol_corto) ?? []
  if (registros.length === 0) { sinDatos++; continue }
  const activo = registros.find(r => !r.puesto_hasta)
  if (activo) conActivo++
  else soloHistorico++
}

console.log(`\nEn dim_puestos:`)
console.log(`  Con registro activo (puesto_hasta NULL): ${conActivo}`)
console.log(`  Solo histórico (puesto_hasta seteado):   ${soloHistorico}`)
console.log(`  Sin datos en dim_puestos:                ${sinDatos}`)

await prisma.$disconnect()
