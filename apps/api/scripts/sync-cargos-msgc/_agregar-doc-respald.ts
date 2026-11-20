import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos ADD COLUMN IF NOT EXISTS doc_respald VARCHAR(200)
  `)
  console.log('✓ Columna doc_respald asegurada en dim_puestos')

  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapa = new Map<string, string>()
  for (const f of filas) {
    const cargo = String(f['CARGO'] ?? '').trim()
    const doc = String(f['DOC_RESPALD'] ?? '').trim()
    if (cargo && doc && doc !== 'nan') mapa.set(cargo, doc)
  }
  console.log(`CSV: ${filas.length} filas, ${mapa.size} con DOC_RESPALD`)

  if (!EJECUTAR) { console.log('[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  const poblado = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos dp
    SET doc_respald = vals.doc
    FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k.replace(/'/g, "''")}','${v.replace(/'/g, "''")}')`).join(',')})
    AS vals(id_sial_rol, doc)
    WHERE dp.id_sial_rol = vals.id_sial_rol
  `)
  console.log(`✓ doc_respald poblado: ${poblado} filas`)

  const stats = await prisma.$queryRaw<{ con: bigint; sin: bigint }[]>`
    SELECT COUNT(doc_respald) as con, COUNT(*) - COUNT(doc_respald) as sin FROM dim_puestos
  `
  console.log(`  Con doc_respald: ${stats[0].con}`)
  console.log(`  Sin doc_respald: ${stats[0].sin}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
