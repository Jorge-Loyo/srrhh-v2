import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

async function main() {
  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cuil = String(f['CUIL'] ?? '').trim().replace(/-/g, '')
      const sexo = String(f['SEXO'] ?? '').trim().toLowerCase()
      if (cuil && sexo && sexo !== 'nan' && !mapa.has(cuil)) mapa.set(cuil, sexo)
    }
  }
  console.log(`Mapa: ${mapa.size} entradas`)

  const n = await prisma.$executeRawUnsafe(`
    UPDATE dim_personas dp
    SET sexo = vals.sexo
    FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k}','${v}')`).join(',')})
    AS vals(cuil, sexo)
    WHERE dp.cuil = vals.cuil
      AND (dp.sexo IS NULL OR dp.sexo != vals.sexo)
  `)
  console.log(`✓ sexo actualizado: ${n} filas`)

  const dist = await prisma.$queryRaw<{ sexo: string; q: bigint }[]>`
    SELECT COALESCE(sexo, 'NULL') as sexo, COUNT(*) as q
    FROM dim_personas GROUP BY sexo ORDER BY q DESC
  `
  console.log('\n── Estado final ─────────────────────────────────────────')
  for (const r of dist) console.log(`  "${r.sexo}": ${r.q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
