/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Reemplaza cargos.codigo usando el Excel "Mapeo de Cargos - MSGC.xlsx".
//
// Lógica:
//   1. Lee hoja "nominal cargos" del Excel → columnas "ID SIAL Rol" y "Código de Cargo"
//   2. Por cada fila: busca en ocupaciones.id_sial_rol → obtiene cargo_id → actualiza cargos.codigo
//   3. Al final verifica que todos los códigos resultantes sean únicos
//
// Uso:
//   tsx scripts/sync-cargos-msgc/mapear-codigos-desde-excel.ts \
//     --input "Doc/Referencias/Mapeo de Cargos - MSGC.xlsx"
//
// Solo opera contra DATABASE_URL (Neon dev). NO toca producción.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')
import { PrismaClient } from '@prisma/client'

// ── tipos ────────────────────────────────────────────────────────────────────

interface FilaExcel {
  idSialRol: string
  codigoCargo: string
}

interface ResultadoFila {
  idSialRol: string
  codigoCargo: string
  cargoId: string | null
  codigoAnterior: string | null
  estado: 'ok' | 'sin_ocupacion' | 'sin_cargo' | 'codigo_vacio'
}

// ── lectura del Excel ─────────────────────────────────────────────────────────

function leerExcel(rutaExcel: string): FilaExcel[] {
  const wb = XLSX.readFile(rutaExcel)

  // Buscar hoja que contenga "nominal" en el nombre (case-insensitive)
  const nombreHoja = wb.SheetNames.find((n) => n.toLowerCase().includes('nominal'))
  if (!nombreHoja) {
    throw new Error(`No se encontró hoja con "nominal" en el nombre. Hojas disponibles: ${wb.SheetNames.join(', ')}`)
  }
  console.log(`Leyendo hoja: "${nombreHoja}"`)

  const ws = wb.Sheets[nombreHoja]

  // El Excel tiene 2 filas de encabezado:
  //   Fila 1: grupos ("INFORMACIÓN DE CARGOS", etc.) — la ignora xlsx como header
  //   Fila 2: nombres reales de columnas
  // Con header:1 obtenemos arrays de arrays; la fila 2 (índice 1) son los nombres reales.
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
  if (rawRows.length < 2) throw new Error('La hoja tiene menos de 2 filas')

  const encabezados = (rawRows[1] as unknown[]).map((c) => String(c ?? '').trim())
  console.log(`Encabezados (fila 2): ${encabezados.join(' | ')}`)

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '')

  const idxSialRol = encabezados.findIndex((c) => normalize(c).includes('idsialrol'))
  const idxCodigo = encabezados.findIndex((c) => normalize(c) === 'codigodecargo')

  if (idxSialRol < 0) throw new Error(`No se encontró columna "ID SIAL Rol". Encabezados: ${encabezados.join(', ')}`)
  if (idxCodigo < 0) throw new Error(`No se encontró columna "Código de Cargo". Encabezados: ${encabezados.join(', ')}`)

  console.log(`Columna idSialRol: índice ${idxSialRol} ("${encabezados[idxSialRol]}")`)
  console.log(`Columna codigoCargo: índice ${idxCodigo} ("${encabezados[idxCodigo]}")`)

  const resultado: FilaExcel[] = []
  // Datos desde fila 3 en adelante (índice 2+)
  for (const row of rawRows.slice(2) as unknown[][]) {
    const idSialRol = String(row[idxSialRol] ?? '').trim()
    const codigoRaw = String(row[idxCodigo] ?? '').trim()
    if (!idSialRol || !codigoRaw) continue
    // El Excel usa sufijo de 5 dígitos (CPH-P-00001), el sistema usa 6 (CPH-P-000001)
    const codigoCargo = codigoRaw.replace(/-([0-9]{5})$/, '-0$1')
    resultado.push({ idSialRol, codigoCargo })
  }

  return resultado
}

// ── verificación de unicidad ──────────────────────────────────────────────────

async function verificarUnicidad(prisma: PrismaClient): Promise<{ duplicados: { codigo: string; cantidad: number }[] }> {
  const filas = await prisma.$queryRaw<{ codigo: string; cantidad: number }[]>`
    SELECT codigo, count(*)::int AS cantidad
    FROM cargos
    WHERE codigo IS NOT NULL AND deleted_at IS NULL
    GROUP BY codigo
    HAVING count(*) > 1
    ORDER BY cantidad DESC, codigo
  `
  return { duplicados: filas }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const idxInput = args.indexOf('--input')
  if (idxInput < 0 || !args[idxInput + 1]) {
    console.error('Uso: tsx mapear-codigos-desde-excel.ts --input <ruta-al-excel>')
    process.exit(2)
  }

  const rutaExcel = path.resolve(args[idxInput + 1])
  if (!fs.existsSync(rutaExcel)) {
    console.error(`No existe el archivo: ${rutaExcel}`)
    process.exit(1)
  }

  // ── 1. Leer Excel ──────────────────────────────────────────────────────────
  console.log(`\nLeyendo Excel: ${rutaExcel}`)
  const filasExcel = leerExcel(rutaExcel)
  console.log(`Filas válidas en el Excel: ${filasExcel.length}`)

  // Verificar duplicados en el Excel mismo
  const codigosEnExcel = filasExcel.map((f) => f.codigoCargo)
  const duplicadosExcel = codigosEnExcel.filter((c, i) => codigosEnExcel.indexOf(c) !== i)
  if (duplicadosExcel.length > 0) {
    console.warn(`\n⚠ ADVERTENCIA: El Excel tiene ${new Set(duplicadosExcel).size} códigos de cargo duplicados:`)
    for (const c of new Set(duplicadosExcel)) console.warn(`  ${c}`)
  }

  const sialRolesEnExcel = filasExcel.map((f) => f.idSialRol)
  const duplicadosSialRol = sialRolesEnExcel.filter((c, i) => sialRolesEnExcel.indexOf(c) !== i)
  if (duplicadosSialRol.length > 0) {
    console.warn(`\n⚠ ADVERTENCIA: El Excel tiene ${new Set(duplicadosSialRol).size} ID SIAL Rol duplicados:`)
    for (const c of new Set(duplicadosSialRol)) console.warn(`  ${c}`)
  }

  // ── 2. Conectar a BD ───────────────────────────────────────────────────────
  const prisma = new PrismaClient()

  try {
    // ── 3. Resolver idSialRol → cargoId (ocupaciones + padron_historico) ────
    console.log('\nResolviendo idSialRol → cargoId...')
    const todosLosSialRol = filasExcel.map((f) => f.idSialRol)

    // Fuente 1: ocupaciones (cargo activo actual)
    const ocupaciones = await prisma.$queryRaw<{ id_sial_rol: string; cargo_id: string }[]>`
      SELECT id_sial_rol, cargo_id::text AS cargo_id
      FROM ocupaciones
      WHERE id_sial_rol = ANY(${todosLosSialRol}::text[])
    `
    const mapaOcupaciones = new Map(ocupaciones.map((o) => [o.id_sial_rol, o.cargo_id]))
    console.log(`  Via ocupaciones:       ${mapaOcupaciones.size}`)

    // Fuente 2: padron_historico (cargo más reciente por id_sial_rol)
    const sialRolSinOcup = todosLosSialRol.filter((r) => !mapaOcupaciones.has(r))
    const historial = await prisma.$queryRaw<{ id_sial_rol: string; cargo_id: string }[]>`
      SELECT DISTINCT ON (id_sial_rol) id_sial_rol, cargo_id::text
      FROM padron_historico
      WHERE id_sial_rol = ANY(${sialRolSinOcup}::text[])
      ORDER BY id_sial_rol, fecha_asignada DESC
    `
    const mapaHistorial = new Map(historial.map((h) => [h.id_sial_rol, h.cargo_id]))
    console.log(`  Via padron_historico:  ${mapaHistorial.size}`)
    console.log(`  Sin match:             ${sialRolSinOcup.length - mapaHistorial.size}`)

    // Mapa unificado: ocupaciones tiene prioridad
    const mapaUnificado = new Map([...mapaHistorial, ...mapaOcupaciones])

    // Traer códigos actuales de los cargos que vamos a tocar
    const cargoIds = [...new Set([...mapaUnificado.values()])]
    const cargosActuales = await prisma.$queryRaw<{ id: string; codigo: string | null }[]>`
      SELECT id::text AS id, codigo
      FROM cargos
      WHERE id = ANY(${cargoIds}::uuid[])
    `
    const mapaCodigos = new Map(cargosActuales.map((c) => [c.id, c.codigo]))

    // ── 4. Construir plan de actualización ─────────────────────────────────
    const resultados: ResultadoFila[] = []
    const actualizaciones: { cargoId: string; codigoNuevo: string; codigoAnterior: string | null }[] = []

    for (const fila of filasExcel) {
      const cargoId = mapaUnificado.get(fila.idSialRol) ?? null

      if (!cargoId) {
        resultados.push({ ...fila, cargoId: null, codigoAnterior: null, estado: 'sin_ocupacion' })
        continue
      }

      if (!mapaCodigos.has(cargoId)) {
        resultados.push({ ...fila, cargoId, codigoAnterior: null, estado: 'sin_cargo' })
        continue
      }

      const codigoAnterior = mapaCodigos.get(cargoId) ?? null
      resultados.push({ ...fila, cargoId, codigoAnterior, estado: 'ok' })
      // Si el mismo cargoId ya está en el plan (dos idSialRol apuntan al mismo cargo),
      // solo se toma la primera asignación — se evita el conflicto UNIQUE
      if (!actualizaciones.find((a) => a.cargoId === cargoId)) {
        actualizaciones.push({ cargoId, codigoNuevo: fila.codigoCargo, codigoAnterior })
      }
    }

    // ── 5. Resumen antes de ejecutar ───────────────────────────────────────
    const porEstado = resultados.reduce<Record<string, number>>((acc, r) => {
      acc[r.estado] = (acc[r.estado] ?? 0) + 1
      return acc
    }, {})

    console.log('\n── Resumen del plan ──────────────────────────────────────')
    console.log(`  ok (se actualizarán):  ${porEstado['ok'] ?? 0}`)
    console.log(`  sin_ocupacion:         ${porEstado['sin_ocupacion'] ?? 0}`)
    console.log(`  sin_cargo:             ${porEstado['sin_cargo'] ?? 0}`)

    if (actualizaciones.length === 0) {
      console.log('\nNada para actualizar. Saliendo.')
      return
    }

    // ── 6. Ejecutar en dos pasos sin transacción interactiva ────────────────
    console.log(`\nEjecutando ${actualizaciones.length} actualizaciones...`)

    const todosLosCodigosNuevos = actualizaciones.map((a) => a.codigoNuevo)

    // Paso 1: liberar TODOS los cargos que ya tengan alguno de los códigos nuevos
    // (no solo los del plan — evita conflictos UNIQUE con cargos que ya tienen ese código)
    console.log('  Paso 1: liberando códigos en conflicto...')
    let liberados = 0
    for (const lote of trocear(todosLosCodigosNuevos, 1000)) {
      liberados += Number(await prisma.$executeRaw`
        UPDATE cargos
        SET codigo_legacy = COALESCE(codigo_legacy, codigo),
            codigo = NULL,
            updated_at = now()
        WHERE codigo = ANY(${lote}::text[])
      `)
    }
    console.log(`  Paso 1: ${liberados} cargos liberados`)

    // Paso 2: asignar nuevos códigos en lotes
    console.log('  Paso 2: asignando nuevos códigos...')
    let asignados = 0
    for (const lote of trocear(actualizaciones, 1000)) {
      const json = JSON.stringify(lote.map((a) => ({ id: a.cargoId, codigo: a.codigoNuevo })))
      await prisma.$executeRaw`
        UPDATE cargos c
        SET codigo = v.codigo, updated_at = now()
        FROM json_to_recordset(${json}::json) AS v(id uuid, codigo text)
        WHERE c.id = v.id
      `
      asignados += lote.length
      process.stdout.write(`\r  Paso 2: ${asignados}/${actualizaciones.length}`)
    }
    console.log('\n✓ Actualización completada.')

    // ── 7. Verificar unicidad post-actualización ───────────────────────────
    console.log('\nVerificando unicidad de códigos...')
    const { duplicados } = await verificarUnicidad(prisma)

    if (duplicados.length === 0) {
      console.log('✓ Todos los códigos son únicos.')
    } else {
      console.error(`\n✗ Se encontraron ${duplicados.length} códigos duplicados:`)
      for (const d of duplicados.slice(0, 20)) {
        console.error(`  "${d.codigo}" aparece ${d.cantidad} veces`)
      }
      if (duplicados.length > 20) console.error(`  ... y ${duplicados.length - 20} más`)
    }

    // ── 8. Guardar reporte CSV ─────────────────────────────────────────────
    const csvPath = path.join(path.dirname(rutaExcel), 'mapeo_resultado.csv')
    const csvLineas = [
      'idSialRol,codigoCargo,cargoId,codigoAnterior,estado',
      ...resultados.map((r) =>
        [r.idSialRol, r.codigoCargo, r.cargoId ?? '', r.codigoAnterior ?? '', r.estado].join(','),
      ),
    ]
    fs.writeFileSync(csvPath, csvLineas.join('\n'), 'utf8')
    console.log(`\nReporte guardado en: ${csvPath}`)

    // ── 9. Resumen final ───────────────────────────────────────────────────
    console.log('\n── Resumen final ─────────────────────────────────────────')
    console.log(`  Filas en Excel:        ${filasExcel.length}`)
    console.log(`  Actualizados:          ${actualizaciones.length}`)
    console.log(`  Sin ocupación en BD:   ${porEstado['sin_ocupacion'] ?? 0}`)
    console.log(`  Sin cargo en BD:       ${porEstado['sin_cargo'] ?? 0}`)
    console.log(`  Duplicados post-carga: ${duplicados.length}`)
  } finally {
    await prisma.$disconnect()
  }
}

// ── utilidad ──────────────────────────────────────────────────────────────────

function trocear<T>(arr: T[], tam = 500): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += tam) result.push(arr.slice(i, i + tam))
  return result
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
