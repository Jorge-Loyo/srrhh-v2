import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

const parseDate = (s: string): string | null => {
  if (!s || s === 'nan') return null
  // Formato: "01/06/1980 0:00:00"
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return null
  const [, d, m, y] = match
  // Fecha 01/01/4000 = sin fecha de hasta (activo)
  if (y === '4000') return null
  return `${y}-${m}-${d}`
}

async function main() {
  const mapaDesde = new Map<string, string>()
  const mapaHasta = new Map<string, string>()

  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      if (!cargo) continue
      const desde = parseDate(String(f['CARGO_DESDE'] ?? ''))
      const hasta = parseDate(String(f['CARGO_HASTA'] ?? ''))
      if (desde) mapaDesde.set(cargo, desde)
      if (hasta) mapaHasta.set(cargo, hasta)
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Con CARGO_DESDE: ${mapaDesde.size}, con CARGO_HASTA: ${mapaHasta.size}`)

  if (!EJECUTAR) { console.log('[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  // Actualizar puesto_desde
  let n = 0
  for (const [idSialRol, fecha] of mapaDesde) {
    await prisma.$executeRawUnsafe(
      `UPDATE dim_puestos SET puesto_desde = $1::date WHERE id_sial_rol = $2`,
      fecha, idSialRol
    )
    n++
    if (n % 1000 === 0) process.stdout.write(`\r  puesto_desde: ${n}/${mapaDesde.size}`)
  }
  console.log(`\n✓ puesto_desde actualizado: ${n} filas`)

  // Actualizar puesto_hasta
  n = 0
  for (const [idSialRol, fecha] of mapaHasta) {
    await prisma.$executeRawUnsafe(
      `UPDATE dim_puestos SET puesto_hasta = $1::date WHERE id_sial_rol = $2`,
      fecha, idSialRol
    )
    n++
    if (n % 1000 === 0) process.stdout.write(`\r  puesto_hasta: ${n}/${mapaHasta.size}`)
  }
  console.log(`\n✓ puesto_hasta actualizado: ${n} filas`)

  // Resumen
  const stats = await prisma.$queryRaw<{ con_desde: bigint; con_hasta: bigint; sin_desde: bigint; sin_hasta: bigint }[]>`
    SELECT COUNT(puesto_desde) as con_desde, COUNT(puesto_hasta) as con_hasta,
           COUNT(*) - COUNT(puesto_desde) as sin_desde, COUNT(*) - COUNT(puesto_hasta) as sin_hasta
    FROM dim_puestos
  `
  console.log(`\n  Con puesto_desde: ${stats[0].con_desde} | Sin: ${stats[0].sin_desde}`)
  console.log(`  Con puesto_hasta: ${stats[0].con_hasta} | Sin: ${stats[0].sin_hasta}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
