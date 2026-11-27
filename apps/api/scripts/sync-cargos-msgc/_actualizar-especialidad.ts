import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSV = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'

const normalizar = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

async function main() {
  const filas: Record<string, string>[] = parseCsv(fs.readFileSync(CSV, 'utf8'), {
    columns: true, skip_empty_lines: true, bom: true,
  })

  const mapaExcel = new Map<string, string>()
  for (const f of filas) {
    const cargo = String(f['CARGO'] ?? '').trim()
    const esp = String(f['LIT_ESP_CARGO'] ?? '').trim()
    if (cargo && esp && esp !== 'nan') mapaExcel.set(cargo, normalizar(esp))
  }

  const puestos = await prisma.$queryRaw<{ id_sial_rol: string; especialidad: string | null }[]>`
    SELECT id_sial_rol, especialidad FROM dim_puestos
  `

  const aActualizar: { idSialRol: string; espNueva: string; espActual: string }[] = []
  for (const p of puestos) {
    const espNueva = mapaExcel.get(p.id_sial_rol)
    if (!espNueva) continue
    if (!p.especialidad || normalizar(p.especialidad) !== espNueva) {
      aActualizar.push({ idSialRol: p.id_sial_rol, espNueva, espActual: p.especialidad ?? 'NULL' })
    }
  }

  console.log(`A actualizar: ${aActualizar.length}`)
  if (!EJECUTAR) { console.log('[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  let actualizados = 0
  for (const { idSialRol, espNueva } of aActualizar) {
    await prisma.$executeRawUnsafe(
      `UPDATE dim_puestos SET especialidad = $1 WHERE id_sial_rol = $2`,
      espNueva, idSialRol
    )
    actualizados++
    if (actualizados % 500 === 0) process.stdout.write(`\r  Actualizados: ${actualizados}/${aActualizar.length}`)
  }
  console.log(`\n✓ especialidad actualizada: ${actualizados} filas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
