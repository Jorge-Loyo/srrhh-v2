import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'

const normalizar = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

async function main() {
  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapaExcel = new Map<string, string>()
  for (const f of filas) {
    const cargo = String(f['CARGO'] ?? '').trim()
    const esp = String(f['LIT_ESP_CARGO'] ?? '').trim()
    if (cargo && esp && esp !== 'nan') mapaExcel.set(cargo, normalizar(esp))
  }
  console.log(`CSV: ${filas.length} filas, ${mapaExcel.size} con LIT_ESP_CARGO`)

  const puestos = await prisma.$queryRaw<{ id_sial_rol: string; especialidad: string | null }[]>`
    SELECT id_sial_rol, especialidad FROM dim_puestos
  `

  let iguales = 0, distintos = 0, sinMatchCsv = 0, sinEspBd = 0, sinEspCsv = 0
  const grupos = new Map<string, number>()

  for (const p of puestos) {
    const espExcel = mapaExcel.get(p.id_sial_rol)
    if (!espExcel) { sinMatchCsv++; continue }
    if (!p.especialidad) { sinEspBd++; continue }
    const bdNorm = normalizar(p.especialidad)
    if (bdNorm === espExcel) {
      iguales++
    } else {
      distintos++
      const key = `"${p.especialidad}" → "${espExcel}"`
      grupos.set(key, (grupos.get(key) ?? 0) + 1)
    }
  }

  // Cuántos en CSV no tienen especialidad
  for (const f of filas) {
    const esp = String(f['LIT_ESP_CARGO'] ?? '').trim()
    if (!esp || esp === 'nan') sinEspCsv++
  }

  console.log(`\n── Estado especialidad ──────────────────────────────────`)
  console.log(`  Iguales:            ${iguales}`)
  console.log(`  Distintos:          ${distintos}`)
  console.log(`  Sin match CSV:      ${sinMatchCsv}`)
  console.log(`  Sin esp en BD:      ${sinEspBd}`)
  console.log(`  Sin esp en CSV:     ${sinEspCsv}`)

  if (grupos.size > 0) {
    const top = [...grupos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    console.log('\n── Top diferencias ──────────────────────────────────────')
    for (const [par, q] of top) console.log(`  [${q}] ${par}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
