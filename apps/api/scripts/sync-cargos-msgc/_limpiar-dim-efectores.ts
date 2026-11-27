import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

interface FilaCsv { SIGLA: string; COD_REP: string; DESC_REP: string }

function leerCsv(): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const p of CSVS) {
    const filas = parseCsv(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, bom: true }) as FilaCsv[]
    for (const f of filas) {
      const s = f.SIGLA?.trim(); const d = f.DESC_REP?.trim()
      if (s && d && d !== 'nan' && !mapa.has(s)) mapa.set(s, d)
    }
  }
  return mapa
}

async function main() {
  const csv = leerCsv()

  // 1. Todos los efectores actuales
  const todos = await prisma.$queryRaw<{
    sigla: string; nombre: string | null; nombre_completo: string | null; en_hospitales: boolean
  }[]>`SELECT sigla, nombre, nombre_completo, en_hospitales FROM dim_efectores ORDER BY sigla`

  // 2. Siglas DGAH (DIR Adjunta) — a borrar
  const dgah = todos.filter(e => e.sigla.startsWith('DGAH'))
  console.log(`\n── DGAH a eliminar (${dgah.length}) ──`)
  for (const e of dgah) console.log(`  ${e.sigla.padEnd(20)} ${e.nombre_completo ?? '(sin nombre)'}`)

  // 3. Sin nombre_completo
  const sinNombre = todos.filter(e => !e.nombre_completo && !e.sigla.startsWith('DGAH'))
  console.log(`\n── Sin nombre_completo (${sinNombre.length}) ──`)
  for (const e of sinNombre) {
    const enCsv = csv.get(e.sigla)
    console.log(`  ${e.sigla.padEnd(20)} en_hospitales=${e.en_hospitales} | CSV: ${enCsv ?? '(no está en CSV)'}`)
  }

  // 4. Cuántos puestos en dim_puestos usan cada sigla DGAH
  console.log(`\n── Uso de DGAH en dim_puestos ──`)
  const usoDgah = await prisma.$queryRaw<{ efector: string; n: bigint }[]>`
    SELECT efector, COUNT(*) AS n
    FROM dim_puestos
    WHERE efector LIKE 'DGAH%'
    GROUP BY efector ORDER BY efector
  `
  if (usoDgah.length === 0) console.log('  (ninguna sigla DGAH en dim_puestos)')
  for (const r of usoDgah) console.log(`  ${r.efector.padEnd(20)} ${r.n} puestos`)

  if (!EJECUTAR) {
    console.log('\n[DRY-RUN] Pasar --ejecutar para borrar DGAH y completar nombre_completo desde CSV.')
    return
  }

  // 5. Borrar DGAH de dim_efectores (dim_puestos.efector SET NULL por ON DELETE SET NULL)
  const borrados = await prisma.$executeRawUnsafe(
    `DELETE FROM dim_efectores WHERE sigla LIKE 'DGAH%'`
  )
  console.log(`\n✓ DGAH eliminados: ${borrados}`)

  // 6. Completar nombre_completo desde CSV para los que les falta
  let completados = 0
  for (const e of sinNombre) {
    const nombreCompleto = csv.get(e.sigla)
    if (!nombreCompleto) continue
    await prisma.$executeRaw`
      UPDATE dim_efectores SET nombre_completo = ${nombreCompleto} WHERE sigla = ${e.sigla}
    `
    completados++
    console.log(`  ✓ ${e.sigla}: "${nombreCompleto}"`)
  }
  console.log(`✓ nombre_completo completado: ${completados} efectores`)

  // 7. Estado final
  const final = await prisma.$queryRaw<{ total: bigint; sin_nombre: bigint; en_hosp: bigint }[]>`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE nombre_completo IS NULL) AS sin_nombre,
           COUNT(*) FILTER (WHERE en_hospitales = true) AS en_hosp
    FROM dim_efectores
  `
  const f = final[0]
  console.log(`\nEstado final dim_efectores: total=${f.total} | en_hospitales=${f.en_hosp} | sin nombre_completo=${f.sin_nombre}`)

  // 8. Listar los que aún quedan sin nombre_completo
  const aun = await prisma.$queryRaw<{ sigla: string; nombre: string | null }[]>`
    SELECT sigla, nombre FROM dim_efectores WHERE nombre_completo IS NULL ORDER BY sigla
  `
  if (aun.length > 0) {
    console.log(`\n⚠️  Aún sin nombre_completo (completar manualmente):`)
    for (const e of aun) console.log(`  ${e.sigla.padEnd(20)} nombre="${e.nombre ?? '(sin nombre)'}"`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
