/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
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

// Enriquecer con datos del cargo en sistema
const cargos = await prisma.$queryRaw<{
  codigo: string; literal_puesto: string | null; escalafon: string | null; sub_estado: string | null
}[]>`
  SELECT c.codigo, c.literal_puesto, e.nombre AS escalafon, c.sub_estado
  FROM cargos c
  LEFT JOIN escalafones e ON e.id = c.escalafon_id
  WHERE c.deleted_at IS NULL AND c.codigo IS NOT NULL AND c.estado = 'vigente'
`
const cargoDatos = new Map(cargos.map(c => [c.codigo, c]))

const sinOcup = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  return !(ocupPorCodigo.get(f.codigo)?.has(f.sial_rol_corto))
})

console.log(`Sin ocupación activa: ${sinOcup.length}`)

const rows = sinOcup.map(f => {
  const c = cargoDatos.get(f.codigo)
  return {
    'Código Cargo': f.codigo,
    'SIAL Rol (Excel)': f.sial_rol_corto,
    'Literal Puesto': c?.literal_puesto ?? '',
    'Escalafón': c?.escalafon ?? '',
    'Sub Estado Sistema': c?.sub_estado ?? '',
    'Estado Excel': f.estado,
  }
})

const ws = XLSX.utils.json_to_sheet(rows)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Sin ocupación')

const outPath = path.resolve('scripts/sync-cargos-msgc/Doc/Revisar/sin_ocupacion_activa.xlsx')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
XLSX.writeFile(wb, outPath)
console.log(`✓ Exportado: ${outPath}`)

await prisma.$disconnect()
