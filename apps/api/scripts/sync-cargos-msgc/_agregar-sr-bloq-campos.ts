import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'

const normalizar = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

const parseDate = (s: string): string | null => {
  if (!s || s === 'nan') return null
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  const [, d, m, y] = match
  if (y === '4000') return null
  return `${y}-${m}-${d}`
}

async function main() {
  // Agregar columnas
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos
    ADD COLUMN IF NOT EXISTS sr_doc_respald VARCHAR(200),
    ADD COLUMN IF NOT EXISTS bloq_desde DATE,
    ADD COLUMN IF NOT EXISTS bl_motivo VARCHAR(200)
  `)
  console.log('✓ Columnas sr_doc_respald, bloq_desde, bl_motivo aseguradas')

  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapaSrDoc = new Map<string, string>()
  const mapaBloqDesde = new Map<string, string>()
  const mapaBlMotivo = new Map<string, string>()

  for (const f of filas) {
    const cargo = String(f['CARGO'] ?? '').trim()
    if (!cargo) continue
    const srDoc = String(f['SR_DOC_RESPALD'] ?? '').trim()
    const bloqDesde = parseDate(String(f['BLOQ_DESDE'] ?? ''))
    const blMotivo = String(f['BL_MOTIVO'] ?? '').trim()
    if (srDoc && srDoc !== 'nan') mapaSrDoc.set(cargo, srDoc)
    if (bloqDesde) mapaBloqDesde.set(cargo, bloqDesde)
    if (blMotivo && blMotivo !== 'nan') mapaBlMotivo.set(cargo, normalizar(blMotivo))
  }
  console.log(`CSV: ${filas.length} filas`)
  console.log(`Con SR_DOC_RESPALD: ${mapaSrDoc.size}, BLOQ_DESDE: ${mapaBloqDesde.size}, BL_MOTIVO: ${mapaBlMotivo.size}`)

  if (!EJECUTAR) { console.log('[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  const poblarBatch = async (mapa: Map<string, string>, col: string, cast = '') => {
    if (mapa.size === 0) return 0
    const n = await prisma.$executeRawUnsafe(`
      UPDATE dim_puestos dp
      SET ${col} = vals.v${cast}
      FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k.replace(/'/g, "''")}','${v.replace(/'/g, "''")}')`).join(',')})
      AS vals(id_sial_rol, v)
      WHERE dp.id_sial_rol = vals.id_sial_rol
    `)
    return n
  }

  console.log(`✓ sr_doc_respald: ${await poblarBatch(mapaSrDoc, 'sr_doc_respald')} filas`)
  console.log(`✓ bloq_desde:     ${await poblarBatch(mapaBloqDesde, 'bloq_desde', '::date')} filas`)
  console.log(`✓ bl_motivo:      ${await poblarBatch(mapaBlMotivo, 'bl_motivo')} filas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
