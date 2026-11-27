import { PrismaClient } from '@prisma/client'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'

const p = new PrismaClient()

function parseLine(line: string): string[] {
  const cols: string[] = []
  let cur = '', inQuote = false
  for (const ch of line) {
    if (ch === '"') inQuote = !inQuote
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cols.push(cur.trim())
  return cols
}

function parseDate(s: string): string | null {
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

function normHasta(s: string | null): string | null {
  if (!s) return null
  if (parseInt(s.slice(0, 4)) > 2100) return null
  return s
}

const VALID_ID = /^\d{9}-\d{1,2}$/
const BASE = path.resolve('../../Doc/Referencias')

const existentes = await p.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT DISTINCT id_sial_rol FROM dim_actividad_hechos
`
const existentesSet = new Set(existentes.map(r => r.id_sial_rol))
console.log(`Existentes en dim_actividad_hechos: ${existentesSet.size}`)

type Row = { idSialRol: string; cuil: string | null; sitRev: string | null; codReg: string | null; desde: string | null; hasta: string | null }

async function insertarLotes(rows: Row[], label: string) {
  const BATCH = 200
  let insertados = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const lote = rows.slice(i, i + BATCH)
    const placeholders: string[] = []
    const params: (string | null)[] = []
    let idx = 1
    for (const r of lote) {
      const desdeVal = r.desde ?? new Date().toISOString().slice(0, 10)
      placeholders.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++}::date,$${idx++}::date)`)
      params.push(r.idSialRol, r.cuil, r.codReg, r.sitRev, desdeVal, r.hasta)
    }
    const sql = `INSERT INTO dim_actividad_hechos (id_sial_rol, cuil, codigo_cargo, situacion_revista, fecha_desde, fecha_hasta) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`
    await p.$executeRawUnsafe(sql, ...params)
    insertados += lote.length
    process.stdout.write(`\r  ${label}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }
  console.log()
  return insertados
}

// ─── 1. CSV cargos activos ────────────────────────────────────────────────────
// CARGO(0), CUIL(1), SIT_REV(16), COD_REG(21), CARGO_DESDE(41), CARGO_HASTA(42)
const faltantesActivos: Row[] = []
{
  const rl = createInterface({ input: createReadStream(path.join(BASE, 'Cargos_salud_20261115.csv')), crlfDelay: Infinity })
  let header = true
  for await (const line of rl) {
    if (header) { header = false; continue }
    const cols = parseLine(line)
    const idSialRol = cols[0]?.replace(/"/g, '').trim()
    if (!idSialRol || !VALID_ID.test(idSialRol) || existentesSet.has(idSialRol)) continue
    faltantesActivos.push({
      idSialRol,
      cuil:   cols[1]?.replace(/-/g, '').trim().slice(0, 11) || null,
      sitRev: cols[16]?.trim().slice(0, 50) || null,
      codReg: cols[21]?.trim().slice(0, 30) || null,
      desde:  parseDate(cols[41] ?? ''),
      hasta:  normHasta(parseDate(cols[42] ?? '')),
    })
  }
}
console.log(`Faltantes activos: ${faltantesActivos.length}`)
await insertarLotes(faltantesActivos, 'Activos')

// ─── 2. CSV bajas ─────────────────────────────────────────────────────────────
// CARGO(0), CUIL(1), SIT_REV(15), COD_REG(16), CARGO_DESDE(24), CARGO_HASTA(25)
const faltantesBajas: Row[] = []
{
  const rl = createInterface({ input: createReadStream(path.join(BASE, 'Bajas_salud_20261115.csv')), crlfDelay: Infinity })
  let header = true
  for await (const line of rl) {
    if (header) { header = false; continue }
    const cols = parseLine(line)
    const idSialRol = cols[0]?.replace(/"/g, '').trim()
    if (!idSialRol || !VALID_ID.test(idSialRol) || existentesSet.has(idSialRol)) continue
    faltantesBajas.push({
      idSialRol,
      cuil:   cols[1]?.replace(/-/g, '').trim().slice(0, 11) || null,
      sitRev: cols[15]?.trim().slice(0, 50) || null,
      codReg: cols[16]?.trim().slice(0, 30) || null,
      desde:  parseDate(cols[24] ?? ''),
      hasta:  normHasta(parseDate(cols[25] ?? '')),
    })
  }
}
console.log(`Faltantes bajas: ${faltantesBajas.length}`)
await insertarLotes(faltantesBajas, 'Bajas')

// Limpiar fecha_hasta > 2100 que hayan quedado de corridas anteriores
await p.$executeRaw`UPDATE dim_actividad_hechos SET fecha_hasta = NULL WHERE fecha_hasta > '2100-01-01'`

const total    = await p.$queryRaw<{count:bigint}[]>`SELECT COUNT(*) as count FROM dim_actividad_hechos`
const actuales = await p.$queryRaw<{count:bigint}[]>`SELECT COUNT(*) as count FROM dim_actividad_hechos WHERE es_actual = true`

console.log(`\nTotal dim_actividad_hechos: ${total[0].count}`)
console.log(`Actuales (es_actual=true):  ${actuales[0].count}`)

await p.$disconnect()
