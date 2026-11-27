// Puebla codigo_registro en dim_puestos para los registros que quedaron en NULL
// usando el CSV del padrón (CARGO=id_sial_rol, COD_REG=codigo_registro).
// Modo dry-run por defecto; pasar --ejecutar para aplicar.
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')
const CSV_CARGOS = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv'
const CSV_BAJAS  = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv'

async function main() {
  // Cargar ambos CSV → mapa CARGO → COD_REG
  const mapaCodReg = new Map<string, string>()
  for (const csvPath of [CSV_CARGOS, CSV_BAJAS]) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const codReg = String(f['COD_REG'] ?? '').trim()
      if (cargo && codReg && codReg !== 'nan') mapaCodReg.set(cargo, codReg)
    }
    console.log(`CSV ${csvPath.split('/').pop()}: ${filas.length} filas`)
  }
  console.log(`Total mapa: ${mapaCodReg.size} entradas con COD_REG`)

  // Obtener los sin codigo_registro (solo los pendientes)
  const sinCodReg = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
    SELECT id_sial_rol FROM dim_puestos WHERE codigo_registro IS NULL
  `
  console.log(`Pendientes sin codigo_registro: ${sinCodReg.length}`)

  // Cruzar
  const aActualizar: { idSialRol: string; codReg: string }[] = []
  const sinMatch: string[] = []
  for (const { id_sial_rol } of sinCodReg) {
    const codReg = mapaCodReg.get(id_sial_rol)
    if (codReg) aActualizar.push({ idSialRol: id_sial_rol, codReg })
    else sinMatch.push(id_sial_rol)
  }

  console.log(`\n── Resultado del cruce ───────────────────────────────────`)
  console.log(`  Con match en CSV:  ${aActualizar.length}`)
  console.log(`  Sin match en CSV:  ${sinMatch.length}`)

  // Distribución de códigos a asignar
  const distCodigos = new Map<string, number>()
  for (const { codReg } of aActualizar) distCodigos.set(codReg, (distCodigos.get(codReg) ?? 0) + 1)
  console.log('\n── Códigos a asignar ────────────────────────────────────')
  for (const [cod, q] of [...distCodigos.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${cod}: ${q}`)

  if (!EJECUTAR) {
    console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.')
    return
  }

  // Actualizar en batches de 500
  const BATCH = 500
  let actualizados = 0
  for (let i = 0; i < aActualizar.length; i += BATCH) {
    const lote = aActualizar.slice(i, i + BATCH)
    for (const { idSialRol, codReg } of lote) {
      await prisma.$executeRawUnsafe(
        `UPDATE dim_puestos SET codigo_registro = $1 WHERE id_sial_rol = $2`,
        codReg, idSialRol
      )
    }
    actualizados += lote.length
    process.stdout.write(`\r  Actualizados: ${actualizados}/${aActualizar.length}`)
  }
  console.log(`\n✓ codigo_registro poblado desde CSV: ${actualizados} filas`)

  const restantes = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_puestos WHERE codigo_registro IS NULL
  `
  console.log(`  Sin codigo_registro restantes: ${restantes[0].q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
