import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos ADD COLUMN IF NOT EXISTS jcat VARCHAR(10)
  `)
  console.log('✓ Columna jcat asegurada en dim_puestos')

  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const jcat = String(f['JCAT'] ?? '').trim()
      if (cargo && jcat && jcat !== 'nan') mapa.set(cargo, jcat)
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Total mapa: ${mapa.size} entradas con JCAT`)

  // Diagnóstico
  const conJcat = [...mapa.values()].filter(v => v).length
  console.log(`Entradas con JCAT no vacío: ${conJcat}`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  const poblado = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos dp
    SET jcat = vals.jcat
    FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k.replace(/'/g, "''")}','${v.replace(/'/g, "''")}')`).join(',')})
    AS vals(id_sial_rol, jcat)
    WHERE dp.id_sial_rol = vals.id_sial_rol
  `)
  console.log(`✓ jcat poblado: ${poblado} filas`)

  const stats = await prisma.$queryRaw<{ con_jcat: bigint; sin_jcat: bigint }[]>`
    SELECT COUNT(jcat) as con_jcat, COUNT(*) - COUNT(jcat) as sin_jcat FROM dim_puestos
  `
  console.log(`  Con jcat: ${stats[0].con_jcat}`)
  console.log(`  Sin jcat: ${stats[0].sin_jcat}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
