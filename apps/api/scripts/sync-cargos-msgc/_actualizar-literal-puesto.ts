// Actualiza literal_puesto en dim_puestos con el valor del padrón (fuente de verdad),
// normalizado a minúsculas y sin tildes.
// Dry-run por defecto; pasar --ejecutar para aplicar.
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
    const lit = String(f['LIT_PUESTO'] ?? '').trim()
    if (cargo && lit) mapaExcel.set(cargo, normalizar(lit))
  }
  console.log(`CSV: ${filas.length} filas, ${mapaExcel.size} con LIT_PUESTO`)

  const puestos = await prisma.$queryRaw<{ id_sial_rol: string; literal_puesto: string }[]>`
    SELECT id_sial_rol, literal_puesto FROM dim_puestos
  `

  const aActualizar: { idSialRol: string; litNuevo: string; litActual: string }[] = []
  for (const p of puestos) {
    const litNuevo = mapaExcel.get(p.id_sial_rol)
    if (!litNuevo) continue
    if (normalizar(p.literal_puesto) !== litNuevo) {
      aActualizar.push({ idSialRol: p.id_sial_rol, litNuevo, litActual: p.literal_puesto })
    }
  }

  console.log(`\nA actualizar: ${aActualizar.length}`)
  console.log('\n── Muestra (primeros 10) ────────────────────────────────')
  for (const r of aActualizar.slice(0, 10))
    console.log(`  ${r.idSialRol}: "${r.litActual}" → "${r.litNuevo}"`)

  if (!EJECUTAR) {
    console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.')
    return
  }

  let actualizados = 0
  for (const { idSialRol, litNuevo } of aActualizar) {
    await prisma.$executeRawUnsafe(
      `UPDATE dim_puestos SET literal_puesto = $1 WHERE id_sial_rol = $2`,
      litNuevo, idSialRol
    )
    actualizados++
    if (actualizados % 500 === 0) process.stdout.write(`\r  Actualizados: ${actualizados}/${aActualizar.length}`)
  }
  console.log(`\n✓ literal_puesto actualizado: ${actualizados} filas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
