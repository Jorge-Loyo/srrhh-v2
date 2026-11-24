import { PrismaClient, Prisma } from '@prisma/client'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'

const p = new PrismaClient()

function parseDate(s: string): string | null {
  if (!s) return null
  // DD/MM/YYYY HH:MM:SS → YYYY-MM-DD
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

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
    const cargo = cols[idxCargo]?.replace(/"/g, '').trim()
    if (!cargo) continue
    map.set(cargo, {
      cuil: cols[idxCuil]?.replace(/-/g, '').trim() ?? '',
      sitRev: cols[idxSitRev]?.trim() ?? '',
      desde: cols[idxDesde]?.trim() ?? '',
      hasta: cols[idxHasta]?.trim() ?? '',
    })
  }
  return map
}

// Cargos: CARGO(0),CUIL(1),...,SIT_REV(16),...,CARGO_DESDE(40),CARGO_HASTA(41)
// Bajas:  CARGO(0),CUIL(1),...,SIT_REV(5),...,CARGO_DESDE(24),CARGO_HASTA(25)
const BASE = path.resolve('../../Doc/Referencias')
const cargosMap = await readCsv(path.join(BASE, 'Cargos_salud_20261115.csv'), 0, 1, 16, 40, 41)
const bajasMap  = await readCsv(path.join(BASE, 'Bajas_salud_20261115.csv'),  0, 1, 5,  24, 25)

console.log(`CSV cargos: ${cargosMap.size} | CSV bajas: ${bajasMap.size}`)

// ─── 1. Corregir actuales que están en bajas ──────────────────────────────────
const actuales = await p.$queryRaw<{ id: number; id_sial_rol: string; situacion_revista: string }[]>`
  SELECT id, id_sial_rol, situacion_revista FROM dim_actividad_hechos WHERE es_actual = true
`

let bajados = 0, sitRevActualizados = 0

for (const row of actuales) {
  const enBaja = bajasMap.get(row.id_sial_rol)
  const enCargo = cargosMap.get(row.id_sial_rol)

  if (!enCargo && enBaja) {
    // Está en bajas pero marcado como actual → cerrar con fecha_hasta del CSV
    const fechaStr = parseDate(enBaja.hasta) ?? new Date().toISOString().slice(0, 10)
    await p.$executeRaw(Prisma.sql`
      UPDATE dim_actividad_hechos SET fecha_hasta = ${fechaStr}::date WHERE id = ${row.id}
    `)
    bajados++
    continue
  }

  // Actualizar situacion_revista si difiere
  if (enCargo && enCargo.sitRev.toLowerCase() !== row.situacion_revista?.toLowerCase().trim()) {
    await p.$executeRaw(Prisma.sql`
      UPDATE dim_actividad_hechos SET situacion_revista = ${enCargo.sitRev} WHERE id = ${row.id}
    `)
    sitRevActualizados++
  }
}

console.log(`\ndim_actividad_hechos:`)
console.log(`  Actuales cerrados (estaban en bajas): ${bajados}`)
console.log(`  Situacion_revista actualizados: ${sitRevActualizados}`)

// ─── 2. Sincronizar dim_puestos desde CSV cargos (actuales) ──────────────────
const puestosActuales = await p.$queryRaw<{ id_sial_rol: string }[]>`
  SELECT id_sial_rol FROM dim_puestos
`
const puestosSet = new Set(puestosActuales.map(r => r.id_sial_rol))

let puestosActualizados = 0
const BATCH = 500
const cargosEntries = [...cargosMap.entries()]

for (let i = 0; i < cargosEntries.length; i += BATCH) {
  const lote = cargosEntries.slice(i, i + BATCH)
  for (const [idSialRol, csv] of lote) {
    if (puestosSet.has(idSialRol)) {
      const desdeExpr = parseDate(csv.desde) ? Prisma.sql`${parseDate(csv.desde)}::date` : Prisma.sql`NULL::date`
      const hastaExpr = parseDate(csv.hasta) ? Prisma.sql`${parseDate(csv.hasta)}::date` : Prisma.sql`NULL::date`
      await p.$executeRaw(Prisma.sql`
        UPDATE dim_puestos
        SET situacion_revista = ${csv.sitRev || null},
            puesto_desde      = ${desdeExpr},
            puesto_hasta      = ${hastaExpr}
        WHERE id_sial_rol = ${idSialRol}
          AND (
            situacion_revista IS DISTINCT FROM ${csv.sitRev || null}
            OR puesto_desde   IS DISTINCT FROM ${desdeExpr}
            OR puesto_hasta   IS DISTINCT FROM ${hastaExpr}
          )
      `)
    }
    puestosActualizados++
  }
  process.stdout.write(`\r  dim_puestos (cargos): ${Math.min(i + BATCH, cargosEntries.length)}/${cargosEntries.length}`)
}
console.log()

// Actualizar dim_puestos desde CSV bajas (puesto_hasta + motivo_baja)
const bajasEntries = [...bajasMap.entries()]
for (let i = 0; i < bajasEntries.length; i += BATCH) {
  const lote = bajasEntries.slice(i, i + BATCH)
  for (const [idSialRol, csv] of lote) {
    if (!puestosSet.has(idSialRol)) continue
    const hastaExpr = parseDate(csv.hasta) ? Prisma.sql`${parseDate(csv.hasta)}::date` : Prisma.sql`NULL::date`
    await p.$executeRaw(Prisma.sql`
      UPDATE dim_puestos
      SET puesto_hasta = ${hastaExpr}
      WHERE id_sial_rol = ${idSialRol}
        AND puesto_hasta IS DISTINCT FROM ${hastaExpr}
    `)
  }
  process.stdout.write(`\r  dim_puestos (bajas): ${Math.min(i + BATCH, bajasEntries.length)}/${bajasEntries.length}`)
}
console.log()
console.log(`  dim_puestos procesados: cargos=${cargosEntries.length}, bajas=${bajasEntries.length}`)

// ─── 3. Sincronizar dim_personas desde CSV cargos ────────────────────────────
// CSV cargos: AYN(2), NUM_DOC(3), SEXO(4), FEC_NACIM(5)
// Leemos de nuevo con más columnas
async function readCargosPersonas(filePath: string) {
  const map = new Map<string, { cuil: string; ayn: string; numDoc: string; sexo: string; fecNacim: string }>()
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let header = true
  for await (const line of rl) {
    if (header) { header = false; continue }
    const cols = parseLine(line)
    const cuil = cols[1]?.replace(/-/g, '').trim()
    if (!cuil) continue
    if (map.has(cuil)) continue // primera ocurrencia
    map.set(cuil, {
      cuil,
      ayn:     cols[2]?.trim() ?? '',
      numDoc:  cols[3]?.trim() ?? '',
      sexo:    cols[4]?.trim() ?? '',
      fecNacim: cols[5]?.trim() ?? '',
    })
  }
  return map
}

const personasMap = await readCargosPersonas(path.join(BASE, 'Cargos_salud_20261115.csv'))
console.log(`\nPersonas únicas en CSV cargos: ${personasMap.size}`)

const dimPersonas = await p.$queryRaw<{ cuil: string }[]>`SELECT cuil FROM dim_personas`
const dimPersonasSet = new Set(dimPersonas.map(r => r.cuil))

let personasActualizadas = 0
const personasEntries = [...personasMap.entries()]

for (let i = 0; i < personasEntries.length; i += BATCH) {
  const lote = personasEntries.slice(i, i + BATCH)
  for (const [cuil, csv] of lote) {
    if (!dimPersonasSet.has(cuil)) continue
    const d = parseDate(csv.fecNacim)
    const nacimExpr = d ? Prisma.sql`${d}::date` : Prisma.sql`NULL::date`
    const updated = await p.$executeRaw(Prisma.sql`
      UPDATE dim_personas
      SET apellido_nombre  = ${csv.ayn || null},
          sexo             = ${csv.sexo || null},
          fecha_nacimiento = ${nacimExpr}
      WHERE cuil = ${cuil}
        AND (
          apellido_nombre    IS DISTINCT FROM ${csv.ayn || null}
          OR sexo            IS DISTINCT FROM ${csv.sexo || null}
          OR fecha_nacimiento IS DISTINCT FROM ${nacimExpr}
        )
    `)
    if (Number(updated) > 0) personasActualizadas++
  }
  process.stdout.write(`\r  dim_personas: ${Math.min(i + BATCH, personasEntries.length)}/${personasEntries.length}`)
}
console.log()
console.log(`  dim_personas actualizadas: ${personasActualizadas}`)

await p.$disconnect()
console.log('\nListo.')
