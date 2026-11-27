import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

async function main() {
  // Estado actual
  const dist = await prisma.$queryRaw<{ sexo: string; q: bigint }[]>`
    SELECT COALESCE(sexo, 'NULL') as sexo, COUNT(*) as q
    FROM dim_personas GROUP BY sexo ORDER BY q DESC
  `
  console.log('── Valores actuales de sexo en dim_personas ─────────────')
  for (const r of dist) console.log(`  "${r.sexo}": ${r.q}`)

  // Cargar mapa cuil → sexo del CSV
  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cuil = String(f['CUIL'] ?? '').trim().replace(/-/g, '')
      const sexo = String(f['SEXO'] ?? '').trim()
      if (cuil && sexo && sexo !== 'nan' && !mapa.has(cuil)) mapa.set(cuil, sexo)
    }
    console.log(`\nCSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }

  // Valores de sexo en CSV
  const distCsv = new Map<string, number>()
  for (const v of mapa.values()) distCsv.set(v, (distCsv.get(v) ?? 0) + 1)
  console.log('\n── Valores de sexo en CSV ───────────────────────────────')
  for (const [v, q] of [...distCsv.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  "${v}": ${q}`)

  // Comparar
  const personas = await prisma.$queryRaw<{ cuil: string; sexo: string | null }[]>`
    SELECT cuil, sexo FROM dim_personas
  `
  let ok = 0, distinto = 0, sinBd = 0
  const grupos = new Map<string, number>()
  for (const p of personas) {
    const csvSexo = mapa.get(p.cuil)
    if (!csvSexo) continue
    if (!p.sexo) { sinBd++; continue }
    if (p.sexo === csvSexo) ok++
    else {
      distinto++
      const key = `"${p.sexo}" → "${csvSexo}"`
      grupos.set(key, (grupos.get(key) ?? 0) + 1)
    }
  }
  console.log(`\n── Comparación BD vs CSV ─────────────────────────────────`)
  console.log(`  Iguales:   ${ok}`)
  console.log(`  Distintos: ${distinto}`)
  console.log(`  Sin sexo en BD: ${sinBd}`)
  if (grupos.size > 0)
    for (const [par, q] of [...grupos.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`  [${q}] ${par}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
