import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

const normalizar = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

async function main() {
  // Cargar mapa cuil → { idSial, ayn } desde CSV
  const mapa = new Map<string, { idSial: string; ayn: string }>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cuil = String(f['CUIL'] ?? '').trim().replace(/-/g, '')
      const cargo = String(f['CARGO'] ?? '').trim()
      const ayn = String(f['AYN'] ?? '').trim()
      if (!cuil || cuil === 'nan') continue
      if (!mapa.has(cuil)) {
        mapa.set(cuil, { idSial: cargo.split('-')[0], ayn: normalizar(ayn) })
      }
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Mapa CSV: ${mapa.size} personas\n`)

  const personas = await prisma.$queryRaw<{ cuil: string; id_sial: string | null; apellido_nombre: string | null }[]>`
    SELECT cuil, id_sial, apellido_nombre FROM dim_personas
  `

  let idSialOk = 0, idSialDistinto = 0, aynOk = 0, aynDistinto = 0
  const difIdSial: { cuil: string; bd: string; csv: string }[] = []
  const difAyn: { cuil: string; bd: string; csv: string }[] = []

  for (const p of personas) {
    const csv = mapa.get(p.cuil)
    if (!csv) continue

    // id_sial
    if (p.id_sial === csv.idSial) idSialOk++
    else {
      idSialDistinto++
      if (difIdSial.length < 10) difIdSial.push({ cuil: p.cuil, bd: p.id_sial ?? 'NULL', csv: csv.idSial })
    }

    // apellido_nombre
    const bdAyn = normalizar(p.apellido_nombre ?? '')
    if (bdAyn === csv.ayn) aynOk++
    else {
      aynDistinto++
      if (difAyn.length < 10) difAyn.push({ cuil: p.cuil, bd: p.apellido_nombre ?? 'NULL', csv: csv.ayn })
    }
  }

  console.log('── id_sial ───────────────────────────────────────────────')
  console.log(`  Correctos:  ${idSialOk}`)
  console.log(`  Distintos:  ${idSialDistinto}`)
  if (difIdSial.length > 0) for (const r of difIdSial)
    console.log(`  cuil=${r.cuil} | BD="${r.bd}" | CSV="${r.csv}"`)

  console.log('\n── apellido_nombre ───────────────────────────────────────')
  console.log(`  Correctos:  ${aynOk}`)
  console.log(`  Distintos:  ${aynDistinto}`)
  if (difAyn.length > 0) for (const r of difAyn)
    console.log(`  cuil=${r.cuil}\n    BD:  "${r.bd}"\n    CSV: "${r.csv}"`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
