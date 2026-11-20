/* eslint-disable no-console */
// Exporta a Excel los idSialRol del Excel de mapeo que no tuvieron match en BD.
// Lee el CSV generado por mapear-codigos-desde-excel.ts y enriquece con datos de la BD.
//
// Uso:
//   tsx scripts/sync-cargos-msgc/exportar-sin-match.ts \
//     --csv "Doc/Referencias/mapeo_resultado.csv" \
//     --output "Doc/Revisar/sin_match.xlsx"

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')
import { PrismaClient } from '@prisma/client'

async function main() {
  const args = process.argv.slice(2)
  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }

  const csvPath = path.resolve(get('--csv') ?? 'Doc/Referencias/mapeo_resultado.csv')
  const outputPath = path.resolve(get('--output') ?? 'Doc/Revisar/sin_match.xlsx')

  if (!fs.existsSync(csvPath)) { console.error(`No existe: ${csvPath}`); process.exit(1) }

  // ── 1. Leer CSV y filtrar sin_ocupacion ──────────────────────────────────
  const lineas = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean)
  const sinMatch = lineas.slice(1)
    .map((l) => { const [idSialRol, codigoCargo, , , estado] = l.split(','); return { idSialRol, codigoCargo, estado } })
    .filter((r) => r.estado === 'sin_ocupacion')

  console.log(`Sin match en CSV: ${sinMatch.length}`)

  // ── 2. Enriquecer con datos de la BD ─────────────────────────────────────
  const prisma = new PrismaClient()
  try {
    const sialRoles = sinMatch.map((r) => r.idSialRol)

    // Buscar en msgc_hechos_cargo_persona + msgc_personas para datos del cargo/persona
    const hechos = await prisma.$queryRaw<{
      id_sial_rol: string
      cargo_id_sistema: string | null
      cuil: string | null
      apellido_nombre: string | null
      literal_puesto: string | null
      especialidad: string | null
    }[]>`
      SELECT DISTINCT ON (h.id_sial_rol)
        h.id_sial_rol,
        h.cargo_id_sistema::text,
        h.cuil::text,
        p.apellido_nombre,
        pu.literal_puesto,
        pu.especialidad
      FROM msgc_hechos_cargo_persona h
      LEFT JOIN msgc_personas p ON p.cuil = h.cuil
      LEFT JOIN msgc_puestos pu ON pu.id = h.puesto_id
      WHERE h.id_sial_rol = ANY(${sialRoles}::text[])
      ORDER BY h.id_sial_rol
    `
    const mapaHechos = new Map(hechos.map((h) => [h.id_sial_rol, h]))

    // Buscar en dim_puestos
    const dimPuestos = await prisma.$queryRaw<{
      id_sial_rol: string
      cuil: string | null
      literal_puesto: string | null
      especialidad: string | null
    }[]>`
      SELECT id_sial_rol, cuil::text, literal_puesto, especialidad
      FROM dim_puestos
      WHERE id_sial_rol = ANY(${sialRoles}::text[])
    `
    const mapaDim = new Map(dimPuestos.map((d) => [d.id_sial_rol, d]))

    // ── 3. Construir filas para el Excel ────────────────────────────────────
    const filas = sinMatch.map((r) => {
      const h = mapaHechos.get(r.idSialRol)
      const d = mapaDim.get(r.idSialRol)
      return {
        'ID SIAL Rol': r.idSialRol,
        'Código de Cargo (Excel)': r.codigoCargo,
        'CUIL': h?.cuil ?? d?.cuil ?? '',
        'Apellido y Nombre': h?.apellido_nombre ?? '',
        'Literal Puesto': h?.literal_puesto ?? d?.literalPuesto ?? '',
        'Especialidad': h?.especialidad ?? d?.especialidad ?? '',
        'Cargo ID Sistema': h?.cargo_id_sistema ?? '',
        'Fuente': h ? 'hechos_cargo_persona' : d ? 'dim_puestos' : 'sin_datos',
      }
    })

    // ── 4. Generar Excel ────────────────────────────────────────────────────
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(filas)

    // Ancho de columnas
    ws['!cols'] = [20, 28, 16, 30, 35, 30, 38, 22].map((w) => ({ wch: w }))

    XLSX.utils.book_append_sheet(wb, ws, 'Sin Match')
    XLSX.writeFile(wb, outputPath)

    console.log(`\n✓ Excel generado: ${outputPath}`)
    console.log(`  Filas: ${filas.length}`)
    console.log(`  Con datos en msgc_hechos_cargo_persona: ${hechos.length}`)
    console.log(`  Con datos en dim_puestos: ${dimPuestos.length}`)
    console.log(`  Sin datos en ninguna fuente: ${filas.filter((f) => f['Fuente'] === 'sin_datos').length}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
