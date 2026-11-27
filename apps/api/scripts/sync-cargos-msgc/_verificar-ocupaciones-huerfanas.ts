/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const excelPorSial = new Map(mapaExcel.filter(f => f.sial_rol_corto).map(f => [f.sial_rol_corto, f]))

const ocupActivas = await prisma.$queryRaw<{
  id_sial_rol: string; codigo: string; estado: string; sub_estado: string | null
}[]>`
  SELECT o.id_sial_rol, c.codigo, c.estado, c.sub_estado
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL
`

let ok = 0, problema = 0
for (const o of ocupActivas) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (excelPorSial.has(corto)) { ok++; continue }
  // No está en Excel — no debe ser vigente/ocupado
  if (o.estado === 'vigente' && o.sub_estado === 'ocupado') problema++
}

console.log(`Ocupaciones activas en sistema: ${ocupActivas.length}`)
console.log(`  Con match en Excel:                     ${ok}`)
console.log(`  Sin match en Excel:                     ${ocupActivas.length - ok}`)
console.log(`  Sin match + vigente/ocupado (problema): ${problema}`)

await prisma.$disconnect()
