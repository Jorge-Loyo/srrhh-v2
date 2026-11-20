import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv'

const normalizar = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

async function main() {
  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapaMotivo = new Map<string, string>()
  const mapaDocBaja = new Map<string, string>()

  for (const f of filas) {
    const cargo = String(f['CARGO'] ?? '').trim()
    if (!cargo) continue
    const motivo = String(f['MOT_BAJA'] ?? '').trim()
    const docBaja = String(f['DOC_RESP_BAJA'] ?? '').trim()
    if (motivo && motivo !== 'nan') mapaMotivo.set(cargo, normalizar(motivo))
    if (docBaja && docBaja !== 'nan') mapaDocBaja.set(cargo, docBaja)
  }
  console.log(`CSV: ${filas.length} filas`)
  console.log(`Con MOT_BAJA: ${mapaMotivo.size}, con DOC_RESP_BAJA: ${mapaDocBaja.size}`)

  if (!EJECUTAR) { console.log('[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  // motivo_baja
  const pobladoMotivo = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos dp
    SET motivo_baja = vals.motivo
    FROM (VALUES ${[...mapaMotivo.entries()].map(([k, v]) => `('${k.replace(/'/g, "''")}','${v.replace(/'/g, "''")}')`).join(',')})
    AS vals(id_sial_rol, motivo)
    WHERE dp.id_sial_rol = vals.id_sial_rol
      AND (dp.motivo_baja IS NULL OR dp.motivo_baja != vals.motivo)
  `)
  console.log(`✓ motivo_baja actualizado: ${pobladoMotivo} filas`)

  // doc_resp_baja
  const pobladoDoc = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos dp
    SET doc_resp_baja = vals.doc
    FROM (VALUES ${[...mapaDocBaja.entries()].map(([k, v]) => `('${k.replace(/'/g, "''")}','${v.replace(/'/g, "''")}')`).join(',')})
    AS vals(id_sial_rol, doc)
    WHERE dp.id_sial_rol = vals.id_sial_rol
      AND (dp.doc_resp_baja IS NULL OR dp.doc_resp_baja != vals.doc)
  `)
  console.log(`✓ doc_resp_baja actualizado: ${pobladoDoc} filas`)

  const stats = await prisma.$queryRaw<{ con_motivo: bigint; con_doc: bigint }[]>`
    SELECT COUNT(motivo_baja) as con_motivo, COUNT(doc_resp_baja) as con_doc FROM dim_puestos
  `
  console.log(`\n  Con motivo_baja:  ${stats[0].con_motivo}`)
  console.log(`  Con doc_resp_baja: ${stats[0].con_doc}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
