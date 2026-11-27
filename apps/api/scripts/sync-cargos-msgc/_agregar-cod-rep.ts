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
  // Agregar columna
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos ADD COLUMN IF NOT EXISTS cod_rep VARCHAR(20)
  `)
  console.log('✓ Columna cod_rep asegurada en dim_puestos')

  // Cargar mapa desde ambos CSV
  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const codRep = String(f['COD_REP'] ?? '').trim()
      if (cargo && codRep && codRep !== 'nan') mapa.set(cargo, codRep)
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Total mapa: ${mapa.size} entradas con COD_REP`)

  const pendientes = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
    SELECT id_sial_rol FROM dim_puestos WHERE cod_rep IS NULL
  `
  console.log(`Sin cod_rep: ${pendientes.length}`)

  const aActualizar: { idSialRol: string; codRep: string }[] = []
  for (const { id_sial_rol } of pendientes) {
    const codRep = mapa.get(id_sial_rol)
    if (codRep) aActualizar.push({ idSialRol: id_sial_rol, codRep })
  }

  console.log(`Con match:  ${aActualizar.length}`)
  console.log(`Sin match:  ${pendientes.length - aActualizar.length}`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  let actualizados = 0
  for (const { idSialRol, codRep } of aActualizar) {
    await prisma.$executeRawUnsafe(
      `UPDATE dim_puestos SET cod_rep = $1 WHERE id_sial_rol = $2`,
      codRep, idSialRol
    )
    actualizados++
    if (actualizados % 500 === 0) process.stdout.write(`\r  Actualizados: ${actualizados}/${aActualizar.length}`)
  }
  console.log(`\n✓ cod_rep poblado: ${actualizados} filas`)

  const restantes = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_puestos WHERE cod_rep IS NULL
  `
  console.log(`  Sin cod_rep restantes: ${restantes[0].q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
