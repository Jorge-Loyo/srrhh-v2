import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

async function main() {
  // Estado actual dim_personas
  const stats = await prisma.$queryRaw<{ total: bigint; con_idsial: bigint; sin_idsial: bigint }[]>`
    SELECT COUNT(*) as total,
           COUNT(id_sial) as con_idsial,
           COUNT(*) - COUNT(id_sial) as sin_idsial
    FROM dim_personas
  `
  const s = stats[0]
  console.log('── Estado dim_personas ──────────────────────────────────')
  console.log(`  Total:       ${s.total}`)
  console.log(`  Con id_sial: ${s.con_idsial}`)
  console.log(`  Sin id_sial: ${s.sin_idsial}`)

  // Cargar cuil e id_sial de ambos CSV
  const mapaCuilIdSial = new Map<string, string>() // cuil → id_sial
  const mapaIdSialCuil = new Map<string, string>() // id_sial → cuil
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const cuil = String(f['CUIL'] ?? '').trim().replace(/-/g, '')
      if (!cargo || !cuil || cuil === 'nan') continue
      const idSial = cargo.split('-')[0]
      if (idSial) {
        mapaCuilIdSial.set(cuil, idSial)
        mapaIdSialCuil.set(idSial, cuil)
      }
    }
    console.log(`\nCSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`\nMapa cuil→id_sial: ${mapaCuilIdSial.size} entradas`)

  // Personas en BD: ¿están en el CSV?
  const personas = await prisma.$queryRaw<{ cuil: string; id_sial: string | null }[]>`
    SELECT cuil, id_sial FROM dim_personas
  `

  let enCsv = 0, noEnCsv = 0, sinIdSialEnCsv = 0, idSialDistinto = 0
  const muestraDistinto: { cuil: string; bdIdSial: string; csvIdSial: string }[] = []

  for (const p of personas) {
    const csvIdSial = mapaCuilIdSial.get(p.cuil)
    if (!csvIdSial) { noEnCsv++; continue }
    enCsv++
    if (!p.id_sial) { sinIdSialEnCsv++; continue }
    if (p.id_sial !== csvIdSial && muestraDistinto.length < 10) {
      idSialDistinto++
      muestraDistinto.push({ cuil: p.cuil, bdIdSial: p.id_sial, csvIdSial })
    } else if (p.id_sial !== csvIdSial) {
      idSialDistinto++
    }
  }

  console.log('\n── Cruce dim_personas vs CSV ────────────────────────────')
  console.log(`  En CSV:              ${enCsv}`)
  console.log(`  No en CSV (históricos): ${noEnCsv}`)
  console.log(`  Sin id_sial en BD pero en CSV: ${sinIdSialEnCsv}`)
  console.log(`  id_sial distinto BD vs CSV: ${idSialDistinto}`)

  if (muestraDistinto.length > 0) {
    console.log('\n── Muestra id_sial distinto ─────────────────────────────')
    for (const r of muestraDistinto)
      console.log(`  cuil=${r.cuil} | BD="${r.bdIdSial}" | CSV="${r.csvIdSial}"`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
