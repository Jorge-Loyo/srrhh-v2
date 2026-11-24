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

async function readCsv(filePath: string, idxCargo: number, idxCuil: number, idxSitRev: number, idxDesde: number, idxHasta: number) {
  const map = new Map<string, { cuil: string; sitRev: string; desde: string; hasta: string }>()
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let header = true
  for await (const line of rl) {
    if (header) { header = false; continue }
    const cols = parseLine(line)
    const cargo = cols[idxCargo]?.replace(/"/g, '')
    if (!cargo) continue
    map.set(cargo, {
      cuil: cols[idxCuil]?.replace(/-/g, '') ?? '',
      sitRev: cols[idxSitRev] ?? '',
      desde: cols[idxDesde] ?? '',
      hasta: cols[idxHasta] ?? '',
    })
  }
  return map
}

const BASE = path.resolve('../../Doc/Referencias')

// Cargos: CARGO(0),CUIL(1),AYN(2),...,SIT_REV(16),...,CARGO_DESDE(40),CARGO_HASTA(41)
const cargosMap = await readCsv(path.join(BASE, 'Cargos_salud_20261115.csv'), 0, 1, 16, 40, 41)
// Bajas: CARGO(0),CUIL(1),...,SIT_REV(5),...,CARGO_DESDE(24),CARGO_HASTA(25)
const bajasMap  = await readCsv(path.join(BASE, 'Bajas_salud_20261115.csv'),  0, 1, 5,  24, 25)

console.log(`CSV cargos activos: ${cargosMap.size}`)
console.log(`CSV bajas: ${bajasMap.size}`)

// Actuales en dim_actividad_hechos
const actuales = await p.$queryRaw<{ id_sial_rol: string; cuil: string; codigo_cargo: string; situacion_revista: string }[]>`
  SELECT id_sial_rol, cuil, codigo_cargo, situacion_revista FROM dim_actividad_hechos WHERE es_actual = true
`
console.log(`\ndim_actividad_hechos actuales: ${actuales.length}`)

let enCsv = 0, noEnCsv = 0, cuil_diff = 0, sitrev_diff = 0
const noEnCsvSample: string[] = []

for (const row of actuales) {
  const csv = cargosMap.get(row.id_sial_rol)
  if (!csv) {
    noEnCsv++
    if (noEnCsvSample.length < 5) noEnCsvSample.push(row.id_sial_rol)
    continue
  }
  enCsv++
  const csvCuil = csv.cuil.replace(/-/g, '')
  const rowCuil = row.cuil.replace(/-/g, '')
  if (csvCuil !== rowCuil) cuil_diff++
  const csvSit = csv.sitRev.toLowerCase().trim()
  const rowSit = row.situacion_revista.toLowerCase().trim()
  if (csvSit !== rowSit) sitrev_diff++
}

console.log(`  En CSV cargos: ${enCsv}`)
console.log(`  No en CSV cargos: ${noEnCsv}`)
console.log(`  Con CUIL diferente: ${cuil_diff}`)
console.log(`  Con situacion_revista diferente: ${sitrev_diff}`)
if (noEnCsvSample.length) console.log(`  Muestra no encontrados: ${noEnCsvSample.join(', ')}`)

// ¿Los no encontrados están en bajas?
let enBajas = 0
for (const row of actuales) {
  if (!cargosMap.has(row.id_sial_rol) && bajasMap.has(row.id_sial_rol)) enBajas++
}
console.log(`  De los no encontrados, están en bajas CSV: ${enBajas}`)

// Históricos: ¿cuántos están en bajas CSV?
const historicos = await p.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT id_sial_rol FROM dim_actividad_hechos WHERE es_actual = false
`
let histEnBajas = 0, histEnCargos = 0, histEnNinguno = 0
for (const row of historicos) {
  if (bajasMap.has(row.id_sial_rol)) histEnBajas++
  else if (cargosMap.has(row.id_sial_rol)) histEnCargos++
  else histEnNinguno++
}
console.log(`\ndim_actividad_hechos históricos: ${historicos.length}`)
console.log(`  En CSV bajas: ${histEnBajas}`)
console.log(`  En CSV cargos (activo pero marcado histórico): ${histEnCargos}`)
console.log(`  En ninguno: ${histEnNinguno}`)

// Cargos en CSV que NO están en dim_actividad_hechos (actuales)
const dah_ids = new Set(actuales.map(r => r.id_sial_rol))
let csvNoEnDah = 0
const csvNoEnDahSample: string[] = []
for (const [id] of cargosMap) {
  if (!dah_ids.has(id)) {
    csvNoEnDah++
    if (csvNoEnDahSample.length < 5) csvNoEnDahSample.push(id)
  }
}
console.log(`\nEn CSV cargos pero NO en dim_actividad_hechos actuales: ${csvNoEnDah}`)
if (csvNoEnDahSample.length) console.log(`  Muestra: ${csvNoEnDahSample.join(', ')}`)

await p.$disconnect()
