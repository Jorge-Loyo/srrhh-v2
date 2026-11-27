import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

async function main() {
  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const sigla = String(f['SIGLA'] ?? '').trim()
      if (cargo && sigla && sigla !== 'nan') mapa.set(cargo, sigla)
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Total mapa: ${mapa.size} entradas con SIGLA`)

  const sinEfector = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
    SELECT id_sial_rol FROM dim_puestos WHERE efector IS NULL
  `
  console.log(`Sin efector: ${sinEfector.length}`)

  const aActualizar: { idSialRol: string; sigla: string }[] = []
  const sinMatch: number[] = []
  for (const { id_sial_rol } of sinEfector) {
    const sigla = mapa.get(id_sial_rol)
    if (sigla) aActualizar.push({ idSialRol: id_sial_rol, sigla })
    else sinMatch.push(1)
  }

  console.log(`\nCon match:   ${aActualizar.length}`)
  console.log(`Sin match:   ${sinMatch.length}`)

  // Distribución de siglas a asignar
  const dist = new Map<string, number>()
  for (const { sigla } of aActualizar) dist.set(sigla, (dist.get(sigla) ?? 0) + 1)
  console.log('\n── Top siglas a asignar ─────────────────────────────────')
  for (const [sigla, q] of [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${sigla}: ${q}`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  let actualizados = 0
  for (const { idSialRol, sigla } of aActualizar) {
    await prisma.$executeRawUnsafe(
      `UPDATE dim_puestos SET efector = $1 WHERE id_sial_rol = $2`,
      sigla, idSialRol
    )
    actualizados++
    if (actualizados % 500 === 0) process.stdout.write(`\r  Actualizados: ${actualizados}/${aActualizar.length}`)
  }
  console.log(`\n✓ efector poblado: ${actualizados} filas`)

  const restantes = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_puestos WHERE efector IS NULL
  `
  console.log(`  Sin efector restantes: ${restantes[0].q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
