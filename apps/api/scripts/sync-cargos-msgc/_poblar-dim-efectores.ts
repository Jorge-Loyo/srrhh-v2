/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Pobla dim_efectores desde dos fuentes:
//   1. hospitales (75 registros del sistema operativo)
//   2. CSV del padrón MSGC (siglas y nombres completos que no están en hospitales)
//
// Modo dry-run por defecto. Pasar --ejecutar para escribir.
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/_poblar-dim-efectores.ts
//   npx tsx scripts/sync-cargos-msgc/_poblar-dim-efectores.ts --ejecutar
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

const CSVS = [
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Cargos_salud_20261115.csv',
  '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Bajas_salud_20261115.csv',
]

interface FilaCsv {
  SIGLA: string
  COD_REP: string
  DESC_REP: string
}

/** Lee el CSV y devuelve mapa sigla -> nombre_completo (primera aparición, valor original sin normalizar). */
function leerNombresCompletosDelCsv(): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const csvPath of CSVS) {
    const filas = parseCsv(fs.readFileSync(csvPath, 'utf8'), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as FilaCsv[]
    for (const f of filas) {
      const sigla = f.SIGLA?.trim()
      const desc = f.DESC_REP?.trim()
      if (sigla && desc && desc !== 'nan' && !mapa.has(sigla)) {
        mapa.set(sigla, desc)
      }
    }
  }
  return mapa
}

async function main() {
  const nombresPorSigla = leerNombresCompletosDelCsv()
  console.log(`CSV: ${nombresPorSigla.size} siglas con nombre completo`)

  // 1. Leer hospitales del sistema
  const hospitales = await prisma.$queryRaw<{
    sigla: string
    nombre: string
    nombre_resumido: string | null
    tipo: string | null
    universo_totalizador: string | null
    monovalencia: string | null
    comuna: string | null
    tamanio: string | null
    tipificacion_ssah: string | null
    activo: boolean
  }[]>`
    SELECT sigla, nombre, nombre_resumido, tipo, universo_totalizador,
           monovalencia, comuna, tamanio, tipificacion_ssah, activo
    FROM hospitales
    ORDER BY sigla
  `
  console.log(`hospitales: ${hospitales.length} registros`)

  // 2. Leer siglas distintas de dim_puestos
  const siglasPuestos = await prisma.$queryRaw<{ efector: string }[]>`
    SELECT DISTINCT efector FROM dim_puestos WHERE efector IS NOT NULL ORDER BY efector
  `
  console.log(`dim_puestos: ${siglasPuestos.length} siglas distintas en efector`)

  // 3. Construir el universo completo de efectores a insertar
  type Efector = {
    sigla: string
    nombre: string | null
    nombre_completo: string | null
    nombre_resumido: string | null
    tipo: string | null
    universo_totalizador: string | null
    monovalencia: string | null
    comuna: string | null
    tamanio: string | null
    tipificacion_ssah: string | null
    activo: boolean
    en_hospitales: boolean
  }

  const efectores = new Map<string, Efector>()

  // Primero los de hospitales (fuente más completa)
  for (const h of hospitales) {
    efectores.set(h.sigla, {
      sigla: h.sigla,
      nombre: h.nombre,
      nombre_completo: nombresPorSigla.get(h.sigla) ?? null,
      nombre_resumido: h.nombre_resumido,
      tipo: h.tipo,
      universo_totalizador: h.universo_totalizador,
      monovalencia: h.monovalencia,
      comuna: h.comuna,
      tamanio: h.tamanio,
      tipificacion_ssah: h.tipificacion_ssah,
      activo: h.activo,
      en_hospitales: true,
    })
  }

  // Luego las siglas del CSV que no están en hospitales
  for (const [sigla, nombreCompleto] of nombresPorSigla) {
    if (!efectores.has(sigla)) {
      efectores.set(sigla, {
        sigla,
        nombre: null,
        nombre_completo: nombreCompleto,
        nombre_resumido: null,
        tipo: null,
        universo_totalizador: null,
        monovalencia: null,
        comuna: null,
        tamanio: null,
        tipificacion_ssah: null,
        activo: true,
        en_hospitales: false,
      })
    }
  }

  // Siglas de dim_puestos que no están en ninguna fuente (sin nombre)
  const sinNombre: string[] = []
  for (const { efector } of siglasPuestos) {
    if (!efectores.has(efector)) {
      sinNombre.push(efector)
      efectores.set(efector, {
        sigla: efector,
        nombre: null,
        nombre_completo: null,
        nombre_resumido: null,
        tipo: null,
        universo_totalizador: null,
        monovalencia: null,
        comuna: null,
        tamanio: null,
        tipificacion_ssah: null,
        activo: true,
        en_hospitales: false,
      })
    }
  }

  const lista = [...efectores.values()].sort((a, b) => a.sigla.localeCompare(b.sigla))
  const deHospitales = lista.filter((e) => e.en_hospitales)
  const nuevos = lista.filter((e) => !e.en_hospitales)
  const conNombreCompleto = lista.filter((e) => e.nombre_completo !== null)
  const sinNombreCompleto = lista.filter((e) => e.nombre_completo === null)

  console.log(`\nResumen:`)
  console.log(`  Total efectores a insertar: ${lista.length}`)
  console.log(`  De hospitales (en_hospitales=true): ${deHospitales.length}`)
  console.log(`  Nuevos (en_hospitales=false): ${nuevos.length}`)
  console.log(`  Con nombre_completo: ${conNombreCompleto.length}`)
  console.log(`  Sin nombre_completo: ${sinNombreCompleto.length}`)

  if (nuevos.length > 0) {
    console.log(`\nNuevos efectores (no están en hospitales):`)
    for (const e of nuevos) {
      console.log(`  ${e.sigla.padEnd(20)} ${e.nombre_completo ?? '(sin nombre)'}`)
    }
  }

  if (sinNombre.length > 0) {
    console.log(`\n⚠️  Siglas en dim_puestos sin nombre en ninguna fuente:`)
    for (const s of sinNombre) console.log(`  ${s}`)
  }

  if (!EJECUTAR) {
    console.log('\n[DRY-RUN] Pasar --ejecutar para escribir en dim_efectores.')
    return
  }

  // 4. Upsert idempotente: INSERT ... ON CONFLICT DO UPDATE
  let insertados = 0
  let actualizados = 0

  for (const e of lista) {
    const resultado = await prisma.$executeRaw`
      INSERT INTO dim_efectores (
        sigla, nombre, nombre_completo, nombre_resumido, tipo,
        universo_totalizador, monovalencia, comuna, tamanio,
        tipificacion_ssah, activo, en_hospitales
      ) VALUES (
        ${e.sigla}, ${e.nombre}, ${e.nombre_completo}, ${e.nombre_resumido}, ${e.tipo},
        ${e.universo_totalizador}, ${e.monovalencia}, ${e.comuna}, ${e.tamanio},
        ${e.tipificacion_ssah}, ${e.activo}, ${e.en_hospitales}
      )
      ON CONFLICT (sigla) DO UPDATE SET
        nombre             = EXCLUDED.nombre,
        nombre_completo    = EXCLUDED.nombre_completo,
        nombre_resumido    = EXCLUDED.nombre_resumido,
        tipo               = EXCLUDED.tipo,
        universo_totalizador = EXCLUDED.universo_totalizador,
        monovalencia       = EXCLUDED.monovalencia,
        comuna             = EXCLUDED.comuna,
        tamanio            = EXCLUDED.tamanio,
        tipificacion_ssah  = EXCLUDED.tipificacion_ssah,
        activo             = EXCLUDED.activo,
        en_hospitales      = EXCLUDED.en_hospitales
    `
    if (resultado === 1) insertados++
    else actualizados++
  }

  console.log(`\n✓ dim_efectores poblado: ${insertados} insertados, ${actualizados} actualizados`)

  // 5. Verificación final
  const total = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM dim_efectores`
  const enHosp = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM dim_efectores WHERE en_hospitales = true`
  const conNombre = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM dim_efectores WHERE nombre_completo IS NOT NULL`
  console.log(`  Total en tabla: ${total[0].n}`)
  console.log(`  en_hospitales=true: ${enHosp[0].n}`)
  console.log(`  con nombre_completo: ${conNombre[0].n}`)

  // 6. Validar la FK ahora que todas las siglas están en dim_efectores
  await prisma.$executeRawUnsafe(`ALTER TABLE dim_puestos VALIDATE CONSTRAINT dim_puestos_efector_fkey`)
  console.log('✓ FK dim_puestos_efector_fkey validada')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
