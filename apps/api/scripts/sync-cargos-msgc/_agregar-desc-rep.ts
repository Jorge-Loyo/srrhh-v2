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
  // Eliminar el sin cod_rep
  const borrados = await prisma.$executeRawUnsafe(`DELETE FROM dim_puestos WHERE cod_rep IS NULL`)
  console.log(`✓ Eliminados sin cod_rep: ${borrados}`)

  // Agregar columna desc_rep
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos ADD COLUMN IF NOT EXISTS desc_rep VARCHAR(200)
  `)
  console.log('✓ Columna desc_rep asegurada en dim_puestos')

  // Cargar mapa CARGO → DESC_REP
  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const descRep = String(f['DESC_REP'] ?? '').trim()
      if (cargo && descRep && descRep !== 'nan') mapa.set(cargo, descRep)
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Total mapa: ${mapa.size} entradas con DESC_REP`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  // Poblar en batch via SQL para mayor velocidad
  const poblado = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos dp
    SET desc_rep = vals.desc_rep
    FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k.replace(/'/g, "''")}','${v.replace(/'/g, "''")}')`).join(',')}) 
    AS vals(id_sial_rol, desc_rep)
    WHERE dp.id_sial_rol = vals.id_sial_rol
      AND dp.desc_rep IS NULL
  `)
  console.log(`✓ desc_rep poblado: ${poblado} filas`)

  const restantes = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_puestos WHERE desc_rep IS NULL
  `
  console.log(`  Sin desc_rep restantes: ${restantes[0].q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
