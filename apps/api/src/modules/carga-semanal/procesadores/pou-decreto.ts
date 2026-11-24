import { createRequire } from 'node:module'
import { prisma } from '../../../shared/prisma.js'
import { marcarSesionCompletada } from '../carga-semanal.service.js'

import { normalizarTexto } from '@srrhh/utils'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as {
  read: (data: Buffer, opts: Record<string, unknown>) => {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
  utils: {
    sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => Record<string, unknown>[]
    decode_range: (range: string) => { s: { r: number; c: number }; e: { r: number; c: number } }
    encode_cell: (cell: { r: number; c: number }) => string
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FilaDecreto {
  nombreHospital: string
  perfil: string
  especialidad: string
  dotacionDiaria: number | null
  dotacionSem: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function norm(v: unknown): string | null {
  return normalizarTexto(str(v))
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// Detecta si una celda es encabezado de hospital:
// columna C (índice 2) con texto en mayúsculas que contiene "HOSPITAL"
function esNombreHospital(v: unknown): boolean {
  if (!v) return false
  const s = String(v).trim().toUpperCase()
  return s.includes('HOSPITAL') && s.length > 10
}

// ─── Parser de hoja jerárquica ────────────────────────────────────────────────
// La hoja "ULTIMO ANEXO" tiene estructura:
//   Fila de hospital: col C (índice 2) = nombre completo en mayúsculas
//   Filas de datos:   col C = perfil, col D = especialidad, col E = dotacion_diaria, col F = dotacion_sem

type XlsxCell = { v?: unknown } | undefined

function cellVal(sheet: Record<string, unknown>, r: number, c: number): unknown {
  const key = XLSX.utils.encode_cell({ r, c })
  const cell = sheet[key] as XlsxCell
  return cell?.v ?? null
}

function parsearHojaDecreto(ws: unknown): FilaDecreto[] {
  const sheet = ws as Record<string, unknown>
  const ref = sheet['!ref'] as string | undefined
  if (!ref) return []

  const range = XLSX.utils.decode_range(ref)
  const filas: FilaDecreto[] = []
  let hospitalActual: string | null = null

  for (let r = range.s.r; r <= range.e.r; r++) {
    const vC = cellVal(sheet, r, 2)
    const vD = cellVal(sheet, r, 3)
    const vE = cellVal(sheet, r, 4)
    const vF = cellVal(sheet, r, 5)

    const celC = str(vC)
    if (!celC) continue

    if (esNombreHospital(celC)) {
      hospitalActual = celC.trim().toUpperCase()
      continue
    }

    if (!hospitalActual) continue

    const perfil      = norm(vC)
    const especialidad = norm(vD) ?? norm(vC)
    const dotDiaria   = num(vE)
    const dotSem      = num(vF)

    if (!perfil) continue
    if (perfil.startsWith('total') || perfil === 'perfil') continue

    filas.push({
      nombreHospital: hospitalActual,
      perfil,
      especialidad:   especialidad ?? perfil,
      dotacionDiaria: dotDiaria,
      dotacionSem:    dotSem,
    })
  }

  return filas
}

// ─── Procesador principal ─────────────────────────────────────────────────────

const LOTE = 200

export async function procesarPouDecreto(sesionId: string, buffer: Buffer, marcarCompletado = true): Promise<void> {
  // 1. Parsear Excel — hoja "ULTIMO ANEXO"
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false })
  const nombreHoja = wb.SheetNames.find((n) =>
    n.trim().toUpperCase().includes('ULTIMO') || n.trim().toUpperCase().includes('ÚLTIMO'),
  )
  if (!nombreHoja) throw new Error('No se encontró la hoja "ULTIMO ANEXO" en el archivo')

  const ws = wb.Sheets[nombreHoja]
  const filas = parsearHojaDecreto(ws)

  if (!filas.length) throw new Error('No se encontraron filas válidas en la hoja del decreto')

  // 2. Cargar mapeo nombre → sigla
  const mapeos = await prisma.pouDecretoMapeoHospital.findMany()
  if (!mapeos.length) {
    throw new Error(
      'La tabla pou_decreto_mapeo_hospital está vacía. Ejecutar seed_pou_decreto_mapeo.sql primero.',
    )
  }
  const mapaSignla = new Map(mapeos.map((m) => [m.nombrePou.trim().toUpperCase(), m.sigla]))

  // Resolver sigla para cada fila; acumular hospitales sin match
  const sinMatch = new Set<string>()
  type FilaResuelta = FilaDecreto & { sigla: string }
  const filasResueltas: FilaResuelta[] = []

  for (const f of filas) {
    const sigla = mapaSignla.get(f.nombreHospital)
    if (!sigla) {
      sinMatch.add(f.nombreHospital)
      continue
    }
    filasResueltas.push({ ...f, sigla })
  }

  if (sinMatch.size > 0) {
    // No es error fatal — se registra en el informe
    console.warn('[pou-decreto] Hospitales sin match en mapeo:', [...sinMatch])
  }

  if (!filasResueltas.length) {
    throw new Error('Ninguna fila pudo resolverse a una sigla conocida')
  }

  // 3. Cargar estado actual para calcular diffs
  const actuales = await prisma.pouDecreto.findMany({
    select: { sigla: true, perfil: true, especialidad: true, dotacionDiaria: true, dotacionSem: true },
  })
  type ActualRow = (typeof actuales)[number]
  const mapaActual = new Map<string, ActualRow>(
    actuales.map((r) => [`${r.sigla}|${r.perfil}|${r.especialidad}`, r]),
  )

  type DiffInput = {
    sesionId: string
    tablaAfectada: string
    tipoDiff: 'nuevo' | 'modificado' | 'eliminado'
    clave: string
    campo?: string
    valorAnterior?: string | null
    valorNuevo?: string | null
  }
  const diffs: DiffInput[] = []
  const clavesEnArchivo = new Set<string>()

  for (const f of filasResueltas) {
    const clave = `${f.sigla}|${f.perfil}|${f.especialidad}`
    clavesEnArchivo.add(clave)
    const actual = mapaActual.get(clave)

    if (!actual) {
      diffs.push({ sesionId, tablaAfectada: 'pou_decreto', tipoDiff: 'nuevo', clave })
    } else {
      if (actual.dotacionDiaria !== f.dotacionDiaria)
        diffs.push({
          sesionId, tablaAfectada: 'pou_decreto', tipoDiff: 'modificado', clave,
          campo: 'dotacion_diaria',
          valorAnterior: String(actual.dotacionDiaria ?? ''),
          valorNuevo:    String(f.dotacionDiaria ?? ''),
        })
      if (actual.dotacionSem !== f.dotacionSem)
        diffs.push({
          sesionId, tablaAfectada: 'pou_decreto', tipoDiff: 'modificado', clave,
          campo: 'dotacion_sem',
          valorAnterior: String(actual.dotacionSem ?? ''),
          valorNuevo:    String(f.dotacionSem ?? ''),
        })
    }
  }

  for (const clave of mapaActual.keys()) {
    if (!clavesEnArchivo.has(clave))
      diffs.push({ sesionId, tablaAfectada: 'pou_decreto', tipoDiff: 'eliminado', clave })
  }

  // 4. Upsert pou_decreto + registrar carga en transacción
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < filasResueltas.length; i += LOTE) {
        for (const f of filasResueltas.slice(i, i + LOTE)) {
          await tx.pouDecreto.upsert({
            where: { sigla_perfil_especialidad: { sigla: f.sigla, perfil: f.perfil, especialidad: f.especialidad } },
            create: {
              sigla:          f.sigla,
              perfil:         f.perfil,
              especialidad:   f.especialidad,
              dotacionDiaria: f.dotacionDiaria,
              dotacionSem:    f.dotacionSem,
            },
            update: {
              dotacionDiaria: f.dotacionDiaria,
              dotacionSem:    f.dotacionSem,
            },
          })
        }
      }

      await tx.pouDecretoCarga.create({
        data: { sesionId, archivo: nombreHoja, filas: filasResueltas.length },
      })
    },
    { timeout: 120_000 },
  )

  // 5. Insertar diffs
  for (let i = 0; i < diffs.length; i += LOTE) {
    await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
  }

  // 6. Actualizar conteo de filas en dim_carga_archivos
  await prisma.dimCargaArchivo.updateMany({
    where: { sesionId },
    data: { filas: filasResueltas.length },
  })

  // 7. Informe final
  const resumen = {
    tipo: 'pou_decreto',
    totalFilas: filasResueltas.length,
    sinMatch: [...sinMatch],
    pou_decreto: {
      nuevos:      diffs.filter((d) => d.tipoDiff === 'nuevo').length,
      modificados: diffs.filter((d) => d.tipoDiff === 'modificado').length,
      eliminados:  diffs.filter((d) => d.tipoDiff === 'eliminado').length,
    },
  }
  if (marcarCompletado) await marcarSesionCompletada(sesionId, resumen)
  return resumen as any
}
