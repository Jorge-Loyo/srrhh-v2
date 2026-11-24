import { PrismaClient } from '@prisma/client'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'

const prisma = new PrismaClient()
const CSV_PATH = path.resolve('../../Doc/Referencias/Ocupacion_POU_16-11__OC_Pou_Detalle.csv')

async function main() {
  // Muestra de id_sial_rol del CSV
  const csvIds: string[] = []
  const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity })
  let header = true
  for await (const line of rl) {
    if (header) { header = false; continue }
    const cols = line.split(',')
    const id = cols[5]?.trim()
    if (id && csvIds.length < 10) csvIds.push(id)
    if (csvIds.length >= 10) break
  }
  console.log('CSV ID HR (primeros 10):', csvIds)

  // Muestra de id_sial_rol en dim_puestos
  const dpRows = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
    SELECT id_sial_rol FROM dim_puestos WHERE id_sial_rol IS NOT NULL LIMIT 10
  `
  console.log('dim_puestos.id_sial_rol (primeros 10):', dpRows.map(r => r.id_sial_rol))

  // Muestra de id_sial_rol en fact_asignaciones
  const faRows = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
    SELECT id_sial_rol FROM fact_asignaciones WHERE id_sial_rol IS NOT NULL LIMIT 10
  `
  console.log('fact_asignaciones.id_sial_rol (primeros 10):', faRows.map(r => r.id_sial_rol))

  // Intentar match por prefijo (split('-')[0])
  const sample = csvIds.slice(0, 3)
  for (const id of sample) {
    const dp = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
      SELECT id_sial_rol FROM dim_puestos WHERE split_part(id_sial_rol, '-', 1) = ${id} LIMIT 3
    `
    const fa = await prisma.$queryRaw<{ id_sial_rol: string; codigo_cargo: string }[]>`
      SELECT id_sial_rol, codigo_cargo FROM fact_asignaciones WHERE split_part(id_sial_rol, '-', 1) = ${id} LIMIT 3
    `
    console.log(`\nCSV id="${id}":`)
    console.log('  dim_puestos:', dp.map(r => r.id_sial_rol))
    console.log('  fact_asig:', fa.map(r => `${r.id_sial_rol} → ${r.codigo_cargo}`))
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
