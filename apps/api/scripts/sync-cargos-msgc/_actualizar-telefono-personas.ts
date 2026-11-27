import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'

const normTel = (s: string) =>
  s.trim()
    .replace(/^\+54\s*/, '')   // quitar +54 al inicio
    .replace(/\s+/g, '')        // quitar todos los espacios
    .trim()

async function main() {
  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapa = new Map<string, string>()
  for (const f of filas) {
    const cuil = String(f['CUIL'] ?? '').trim().replace(/-/g, '')
    const tel = normTel(String(f['TELEFONO'] ?? ''))
    if (cuil && tel && tel !== 'nan' && tel !== '0') mapa.set(cuil, tel)
  }
  console.log(`CSV: ${filas.length} filas, ${mapa.size} con TELEFONO`)

  const personas = await prisma.$queryRaw<{ cuil: string; telefono: string | null }[]>`
    SELECT cuil, telefono FROM dim_personas
  `

  let iguales = 0, distintos = 0, sinBd = 0, aActualizar = 0
  const grupos = new Map<string, number>()

  for (const p of personas) {
    const telCsv = mapa.get(p.cuil)
    if (!telCsv) continue
    if (!p.telefono) { sinBd++; aActualizar++; continue }
    if (p.telefono === telCsv) iguales++
    else {
      distintos++
      aActualizar++
      const key = `"${p.telefono}" → "${telCsv}"`
      grupos.set(key, (grupos.get(key) ?? 0) + 1)
    }
  }

  console.log(`\n── Estado telefono ───────────────────────────────────────`)
  console.log(`  Iguales:        ${iguales}`)
  console.log(`  Distintos:      ${distintos}`)
  console.log(`  Sin tel en BD:  ${sinBd}`)
  console.log(`  A actualizar:   ${aActualizar}`)

  if (grupos.size > 0) {
    console.log('\n── Muestra diferencias (top 10) ─────────────────────────')
    for (const [par, q] of [...grupos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
      console.log(`  [${q}] ${par}`)
  }

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  const n = await prisma.$executeRawUnsafe(`
    UPDATE dim_personas dp
    SET telefono = vals.tel
    FROM (VALUES ${[...mapa.entries()].map(([k, v]) => `('${k}','${v.replace(/'/g, "''")}')`).join(',')})
    AS vals(cuil, tel)
    WHERE dp.cuil = vals.cuil
      AND (dp.telefono IS NULL OR dp.telefono != vals.tel)
  `)
  console.log(`✓ telefono actualizado: ${n} filas`)

  const stats = await prisma.$queryRaw<{ con: bigint; sin: bigint }[]>`
    SELECT COUNT(telefono) as con, COUNT(*) - COUNT(telefono) as sin FROM dim_personas
  `
  console.log(`  Con telefono: ${stats[0].con} | Sin: ${stats[0].sin}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
