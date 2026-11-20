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
  // Cargar cuils del CSV
  const cuilsEnCsv = new Set<string>()
  const mapaCuilIdSial = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas: Record<string, string>[] = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true, skip_empty_lines: true, bom: true,
    })
    for (const f of filas) {
      const cargo = String(f['CARGO'] ?? '').trim()
      const cuil = String(f['CUIL'] ?? '').trim().replace(/-/g, '')
      if (!cuil || cuil === 'nan') continue
      cuilsEnCsv.add(cuil)
      const idSial = cargo.split('-')[0]
      if (idSial && !mapaCuilIdSial.has(cuil)) mapaCuilIdSial.set(cuil, idSial)
    }
  }
  console.log(`Cuils en CSV: ${cuilsEnCsv.size}`)

  const personas = await prisma.$queryRaw<{ cuil: string; id_sial: string | null }[]>`
    SELECT cuil, id_sial FROM dim_personas
  `

  const aEliminar = personas.filter(p => !cuilsEnCsv.has(p.cuil)).map(p => p.cuil)
  const aPoblar = personas.filter(p => !p.id_sial && cuilsEnCsv.has(p.cuil))

  console.log(`A eliminar (no en CSV): ${aEliminar.length}`)
  console.log(`A poblar id_sial:       ${aPoblar.length}`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  // Eliminar históricos
  if (aEliminar.length > 0) {
    const n = await prisma.$executeRawUnsafe(`
      DELETE FROM dim_personas WHERE cuil IN (${aEliminar.map(c => `'${c}'`).join(',')})
    `)
    console.log(`✓ Eliminados: ${n}`)
  }

  // Poblar id_sial faltantes
  for (const p of aPoblar) {
    const idSial = mapaCuilIdSial.get(p.cuil)
    if (!idSial) continue
    await prisma.$executeRawUnsafe(
      `UPDATE dim_personas SET id_sial = $1 WHERE cuil = $2`,
      idSial, p.cuil
    )
  }
  console.log(`✓ id_sial poblado: ${aPoblar.length} filas`)

  const final = await prisma.$queryRaw<{ total: bigint; sin_idsial: bigint }[]>`
    SELECT COUNT(*) as total, COUNT(*) - COUNT(id_sial) as sin_idsial FROM dim_personas
  `
  console.log(`\n  Total: ${final[0].total} | Sin id_sial: ${final[0].sin_idsial}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
