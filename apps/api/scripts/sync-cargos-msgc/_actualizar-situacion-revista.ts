import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

const normalizar = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

async function main() {
  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const sitRev = String(f['SIT_REV'] ?? '').trim()
      if (cargo && sitRev && sitRev !== 'nan') mapa.set(cargo, normalizar(sitRev))
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Total mapa: ${mapa.size} entradas con SIT_REV`)

  const puestos = await prisma.$queryRaw<{ id_sial_rol: string; situacion_revista: string | null }[]>`
    SELECT id_sial_rol, situacion_revista FROM dim_puestos
  `

  let iguales = 0, distintos = 0, sinMatchCsv = 0, sinSitBd = 0
  const grupos = new Map<string, number>()
  const aActualizar: { idSialRol: string; sitNueva: string }[] = []

  for (const p of puestos) {
    const sitNueva = mapa.get(p.id_sial_rol)
    if (!sitNueva) { sinMatchCsv++; continue }
    if (!p.situacion_revista) { sinSitBd++; aActualizar.push({ idSialRol: p.id_sial_rol, sitNueva }); continue }
    const bdNorm = normalizar(p.situacion_revista)
    if (bdNorm === sitNueva) {
      iguales++
    } else {
      distintos++
      const key = `"${p.situacion_revista}" → "${sitNueva}"`
      grupos.set(key, (grupos.get(key) ?? 0) + 1)
      aActualizar.push({ idSialRol: p.id_sial_rol, sitNueva })
    }
  }

  console.log(`\n── Estado situacion_revista ──────────────────────────────`)
  console.log(`  Iguales:       ${iguales}`)
  console.log(`  Distintos:     ${distintos}`)
  console.log(`  Sin sit en BD: ${sinSitBd}`)
  console.log(`  Sin match CSV: ${sinMatchCsv}`)
  console.log(`  A actualizar:  ${aActualizar.length}`)

  if (grupos.size > 0) {
    console.log('\n── Diferencias agrupadas ────────────────────────────────')
    for (const [par, q] of [...grupos.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`  [${q}] ${par}`)
  }

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  let actualizados = 0
  for (const { idSialRol, sitNueva } of aActualizar) {
    await prisma.$executeRawUnsafe(
      `UPDATE dim_puestos SET situacion_revista = $1 WHERE id_sial_rol = $2`,
      sitNueva, idSialRol
    )
    actualizados++
    if (actualizados % 500 === 0) process.stdout.write(`\r  Actualizados: ${actualizados}/${aActualizar.length}`)
  }
  console.log(`\n✓ situacion_revista actualizada: ${actualizados} filas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
