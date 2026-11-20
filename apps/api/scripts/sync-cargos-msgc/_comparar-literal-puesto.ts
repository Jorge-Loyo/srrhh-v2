import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'

async function main() {
  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  // Mapa CARGO → LIT_PUESTO del excel
  const mapaExcel = new Map<string, string>()
  for (const f of filas) {
    const cargo = String(f['CARGO'] ?? '').trim()
    const lit = String(f['LIT_PUESTO'] ?? '').trim()
    if (cargo && lit) mapaExcel.set(cargo, lit)
  }
  console.log(`CSV: ${filas.length} filas, ${mapaExcel.size} con LIT_PUESTO`)

  // Traer dim_puestos que matchean con el excel
  const puestos = await prisma.$queryRaw<{ id_sial_rol: string; literal_puesto: string }[]>`
    SELECT id_sial_rol, literal_puesto FROM dim_puestos
  `

  let iguales = 0, distintos = 0, sinMatch = 0
  for (const p of puestos) {
    const litExcel = mapaExcel.get(p.id_sial_rol)
    if (!litExcel) { sinMatch++; continue }
    const bdNorm = p.literal_puesto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const exNorm = litExcel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (bdNorm === exNorm) iguales++
    else distintos++
  }
  const grupos = new Map<string, number>()
  for (const p of puestos) {
    const litExcel = mapaExcel.get(p.id_sial_rol)
    if (!litExcel) continue
    const bdNorm = p.literal_puesto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const exNorm = litExcel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (bdNorm !== exNorm) {
      const key = `"${p.literal_puesto}" → "${litExcel}"`
      grupos.set(key, (grupos.get(key) ?? 0) + 1)
    }
  }
  const diferencias = [...grupos.entries()].sort((a, b) => b[1] - a[1])

  console.log(`\n── Resultado comparación ────────────────────────────────`)
  console.log(`  Iguales:       ${iguales}`)
  console.log(`  Distintos:     ${distintos}`)
  console.log(`  Sin match CSV: ${sinMatch}`)

  console.log(`
── Pares distintos (BD → Excel) agrupados ───────────────`)
  for (const [par, q] of diferencias) console.log(`  [${q}] ${par}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
