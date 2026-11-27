import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'

const norm = (s: string) =>
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
  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapas = {
    mail_personal:   new Map<string, string>(),
    mail_laboral:    new Map<string, string>(),
    domicilio:       new Map<string, string>(),
    localidad:       new Map<string, string>(),
    provincia:       new Map<string, string>(),
    salud_1er_cargo: new Map<string, string>(),
  }

  for (const f of filas) {
    const cuil = String(f['CUIL'] ?? '').trim().replace(/-/g, '')
    if (!cuil || cuil === 'nan') continue
    const mp = String(f['MAIL_PERSONAL'] ?? '').trim().toLowerCase()
    const ml = String(f['MAIL_LABORAL'] ?? '').trim().toLowerCase()
    const dom = norm(String(f['DOMICILIO'] ?? ''))
    const loc = norm(String(f['LOCALIDAD'] ?? ''))
    const prov = norm(String(f['PROVINCIA'] ?? ''))
    const s1c = parseDate(String(f['SALUD_1ER_CARGO'] ?? ''))
    if (mp && mp !== 'nan') mapas.mail_personal.set(cuil, mp)
    if (ml && ml !== 'nan') mapas.mail_laboral.set(cuil, ml)
    if (dom && dom !== 'nan') mapas.domicilio.set(cuil, dom)
    if (loc && loc !== 'nan') mapas.localidad.set(cuil, loc)
    if (prov && prov !== 'nan') mapas.provincia.set(cuil, prov)
    if (s1c) mapas.salud_1er_cargo.set(cuil, s1c)
  }

  console.log('── Entradas con datos en CSV ────────────────────────────')
  for (const [campo, mapa] of Object.entries(mapas))
    console.log(`  ${campo}: ${mapa.size}`)

  // Agregar salud_1er_cargo si no existe
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_personas
    ADD COLUMN IF NOT EXISTS salud_1er_cargo DATE,
    ADD COLUMN IF NOT EXISTS provincia VARCHAR(100)
  `)
  console.log('\n✓ Columnas salud_1er_cargo y provincia aseguradas')

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  const poblarBatch = async (mapa: Map<string, string>, col: string, cast = '') => {
    if (mapa.size === 0) return 0
    const n = await prisma.$executeRawUnsafe(`
      UPDATE dim_personas dp
      SET ${col} = vals.v${cast}
      FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k}','${v.replace(/'/g, "''")}')`).join(',')})
      AS vals(cuil, v)
      WHERE dp.cuil = vals.cuil
        AND (dp.${col} IS NULL OR dp.${col}::text != vals.v)
    `)
    return n
  }

  console.log(`✓ mail_personal:   ${await poblarBatch(mapas.mail_personal, 'mail_personal')} filas`)
  console.log(`✓ mail_laboral:    ${await poblarBatch(mapas.mail_laboral, 'mail_laboral')} filas`)
  console.log(`✓ domicilio:       ${await poblarBatch(mapas.domicilio, 'domicilio')} filas`)
  console.log(`✓ localidad:       ${await poblarBatch(mapas.localidad, 'localidad')} filas`)
  console.log(`✓ provincia:       ${await poblarBatch(mapas.provincia, 'provincia')} filas`)
  console.log(`✓ salud_1er_cargo: ${await poblarBatch(mapas.salud_1er_cargo, 'salud_1er_cargo', '::date')} filas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
