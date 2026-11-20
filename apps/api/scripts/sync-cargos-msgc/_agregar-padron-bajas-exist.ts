import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

const ARCHIVOS = [
  { path: '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',  campo: 'padron_exist', fecha: '2026-11-15' },
  { path: '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',   campo: 'bajas_exist',  fecha: '2026-11-15' },
]

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos
    ADD COLUMN IF NOT EXISTS padron_exist DATE,
    ADD COLUMN IF NOT EXISTS bajas_exist DATE
  `)
  console.log('✓ Columnas padron_exist, bajas_exist aseguradas')

  for (const { path, campo, fecha } of ARCHIVOS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(path, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    const ids = new Set(filas.map(f => String(f['CARGO'] ?? '').trim()).filter(Boolean))
    console.log(`\n${path.split('/').pop()}: ${ids.size} ids únicos → ${campo} = ${fecha}`)

    if (!EJECUTAR) continue

    // Poblar en batch SQL con lista de ids
    const idList = [...ids].map(id => `'${id.replace(/'/g, "''")}'`).join(',')
    const n = await prisma.$executeRawUnsafe(`
      UPDATE dim_puestos
      SET ${campo} = '${fecha}'::date
      WHERE id_sial_rol IN (${idList})
    `)
    console.log(`✓ ${campo}: ${n} filas`)
  }

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  const stats = await prisma.$queryRaw<{ con_padron: bigint; con_bajas: bigint; sin_padron: bigint; sin_bajas: bigint }[]>`
    SELECT COUNT(padron_exist) as con_padron, COUNT(bajas_exist) as con_bajas,
           COUNT(*) - COUNT(padron_exist) as sin_padron, COUNT(*) - COUNT(bajas_exist) as sin_bajas
    FROM dim_puestos
  `
  console.log(`\n  padron_exist: ${stats[0].con_padron} con | ${stats[0].sin_padron} sin`)
  console.log(`  bajas_exist:  ${stats[0].con_bajas} con | ${stats[0].sin_bajas} sin`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
