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
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos
    ADD COLUMN IF NOT EXISTS escritorio VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pou_desde DATE,
    ADD COLUMN IF NOT EXISTS dia VARCHAR(20),
    ADD COLUMN IF NOT EXISTS doc_resp VARCHAR(200)
  `)
  console.log('✓ Columnas escritorio, pou_desde, dia, doc_resp aseguradas')

  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapaEscritorio = new Map<string, string>()
  const mapaPouDesde = new Map<string, string>()
  const mapaDia = new Map<string, string>()
  const mapaDocResp = new Map<string, string>()

  for (const f of filas) {
    const cargo = String(f['CARGO'] ?? '').trim()
    if (!cargo) continue
    const escritorio = String(f['ESCRITORIO'] ?? '').trim()
    const pouDesde = parseDate(String(f['POU_DESDE'] ?? ''))
    const dia = String(f['DIA'] ?? '').trim()
    const docResp = String(f['DOC_RESP'] ?? '').trim()
    if (escritorio && escritorio !== 'nan') mapaEscritorio.set(cargo, normalizar(escritorio))
    if (pouDesde) mapaPouDesde.set(cargo, pouDesde)
    if (dia && dia !== 'nan') mapaDia.set(cargo, dia)
    if (docResp && docResp !== 'nan') mapaDocResp.set(cargo, docResp)
  }
  console.log(`CSV: ${filas.length} filas`)
  console.log(`Con ESCRITORIO: ${mapaEscritorio.size}, POU_DESDE: ${mapaPouDesde.size}, DIA: ${mapaDia.size}, DOC_RESP: ${mapaDocResp.size}`)

  if (!EJECUTAR) { console.log('[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  const poblarBatch = async (mapa: Map<string, string>, col: string, cast = '') => {
    if (mapa.size === 0) { console.log(`  ${col}: 0 filas`); return }
    const n = await prisma.$executeRawUnsafe(`
      UPDATE dim_puestos dp
      SET ${col} = vals.v${cast}
      FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k.replace(/'/g, "''")}','${v.replace(/'/g, "''")}')`).join(',')})
      AS vals(id_sial_rol, v)
      WHERE dp.id_sial_rol = vals.id_sial_rol
    `)
    console.log(`✓ ${col}: ${n} filas`)
  }

  await poblarBatch(mapaEscritorio, 'escritorio')
  await poblarBatch(mapaPouDesde, 'pou_desde', '::date')
  await poblarBatch(mapaDia, 'dia')
  await poblarBatch(mapaDocResp, 'doc_resp')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
