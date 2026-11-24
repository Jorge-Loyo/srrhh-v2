import { createRequire } from 'node:module'
import { prisma } from '../../../shared/prisma.js'
import { marcarSesionCompletada, marcarSesionPendiente } from '../carga-semanal.service.js'

import { normalizarTexto } from '@srrhh/utils'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as {
  read: (data: Buffer, opts: Record<string, unknown>) => {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
  utils: {
    sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => Record<string, unknown>[]
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FilaPouBase {
  sigla: string
  descripcionSigla: string | null
  perfil: string
  especialidad: string
  dotacionDiaria: number | null
  dotacionSem: number | null
  dotacionTotal: number | null
  activos: number | null
  tecnicos: number | null
  vacantes: number | null
}

// ─── Parser ───────────────────────────────────────────────────────────────────

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

function parsearFilaBase(row: Record<string, unknown>): FilaPouBase | null {
  const sigla       = str(row['SIGLA'])
  const perfil      = norm(row['PERFIL'])
  const especialidad = norm(row['ESPECIALIDAD'])
  if (!sigla || !perfil || !especialidad) return null

  return {
    sigla,
    descripcionSigla: str(row['Descrip. Sigla']),
    perfil,
    especialidad,
    dotacionDiaria: num(row['Dotación Diaria']),
    dotacionSem:    num(row['Dotación Sem']),
    dotacionTotal:  num(row['Dotación Total']),
    activos:        num(row['Activos']),
    tecnicos:       num(row['Técnicos']),
    // Columna 10 (índice) es "Vacantes" del POU principal — hay dos columnas
    // con ese nombre; xlsx toma la primera. La segunda (col 14) es SG Vacantes.
    vacantes:       num(row['Vacantes']),
  }
}

// ─── Tipos de resumen ────────────────────────────────────────────────────────

export interface ResumenOcupacionPou {
  totalFilas: number
  pou: { nuevos: number; modificados: number; eliminados: number }
}

// ─── Helpers compartidos ──────────────────────────────────────────────────────

const LOTE = 200

type DiffInput = {
  sesionId: string; tablaAfectada: string
  tipoDiff: 'nuevo' | 'modificado' | 'eliminado'
  clave: string; campo?: string
  valorAnterior?: string | null; valorNuevo?: string | null
}

function parsearBuffer(buffer: Buffer): FilaPouBase[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const hojaBase = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'base')
  if (!hojaBase) throw new Error('No se encontró la hoja "Base" en el archivo')
  const ws = wb.Sheets[hojaBase]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]
  const filas = rawRows.map(parsearFilaBase).filter((f): f is FilaPouBase => f !== null)
  if (!filas.length) throw new Error('La hoja Base no tiene filas válidas')
  return filas
}

async function calcularDiffs(sesionId: string, filas: FilaPouBase[]): Promise<DiffInput[]> {
  const actuales = await prisma.dimPouOcupacion.findMany({
    select: { sigla: true, perfil: true, especialidad: true, dotacionTotal: true, activos: true, vacantes: true },
  })
  const mapaActual = new Map(actuales.map((r) => [`${r.sigla}|${r.perfil}|${r.especialidad}`, r]))

  const diffs: DiffInput[] = []
  const clavesEnArchivo = new Set<string>()

  for (const f of filas) {
    const clave = `${f.sigla}|${f.perfil}|${f.especialidad}`
    clavesEnArchivo.add(clave)
    const actual = mapaActual.get(clave)
    if (!actual) {
      diffs.push({ sesionId, tablaAfectada: 'pou', tipoDiff: 'nuevo', clave })
    } else {
      if (actual.dotacionTotal !== f.dotacionTotal)
        diffs.push({ sesionId, tablaAfectada: 'pou', tipoDiff: 'modificado', clave, campo: 'dotacion_total',
          valorAnterior: String(actual.dotacionTotal ?? ''), valorNuevo: String(f.dotacionTotal ?? '') })
      if (actual.activos !== f.activos)
        diffs.push({ sesionId, tablaAfectada: 'pou', tipoDiff: 'modificado', clave, campo: 'activos',
          valorAnterior: String(actual.activos ?? ''), valorNuevo: String(f.activos ?? '') })
      if (actual.vacantes !== f.vacantes)
        diffs.push({ sesionId, tablaAfectada: 'pou', tipoDiff: 'modificado', clave, campo: 'vacantes',
          valorAnterior: String(actual.vacantes ?? ''), valorNuevo: String(f.vacantes ?? '') })
    }
  }
  for (const clave of mapaActual.keys()) {
    if (!clavesEnArchivo.has(clave))
      diffs.push({ sesionId, tablaAfectada: 'pou', tipoDiff: 'eliminado', clave })
  }
  return diffs
}

// ─── FASE 1: parsear + calcular diff (sin escribir datos de negocio) ──────────

export async function parsearYDiffearOcupacionPou(
  sesionId: string,
  buffer: Buffer,
): Promise<ResumenOcupacionPou> {
  const filas = parsearBuffer(buffer)
  const diffs = await calcularDiffs(sesionId, filas)

  await Promise.all([
    (async () => {
      for (let i = 0; i < diffs.length; i += LOTE) {
        await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
      }
    })(),
    prisma.dimCargaArchivo.updateMany({ where: { sesionId }, data: { filas: filas.length } }),
  ])

  const resumen: ResumenOcupacionPou = {
    totalFilas: filas.length,
    pou: {
      nuevos:      diffs.filter((d) => d.tipoDiff === 'nuevo').length,
      modificados: diffs.filter((d) => d.tipoDiff === 'modificado').length,
      eliminados:  diffs.filter((d) => d.tipoDiff === 'eliminado').length,
    },
  }

  await marcarSesionPendiente(sesionId, { tipo: 'ocupacion_pou', ...resumen })
  return resumen
}

// ─── FASE 2: aplicar cambios (escribe en BD, se llama al confirmar) ──────────

export async function aplicarCambiosOcupacionPou(
  sesionId: string,
  buffer: Buffer,
): Promise<void> {
  const filas = parsearBuffer(buffer)

  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < filas.length; i += LOTE) {
        for (const f of filas.slice(i, i + LOTE)) {
          await tx.dimPouOcupacion.upsert({
            where: { sigla_perfil_especialidad: { sigla: f.sigla, perfil: f.perfil, especialidad: f.especialidad } },
            create: {
              sigla: f.sigla, descripcionSigla: f.descripcionSigla, perfil: f.perfil,
              especialidad: f.especialidad, dotacionDiaria: f.dotacionDiaria, dotacionSem: f.dotacionSem,
              dotacionTotal: f.dotacionTotal, activos: f.activos, tecnicos: f.tecnicos, vacantes: f.vacantes,
            },
            update: {
              descripcionSigla: f.descripcionSigla, dotacionDiaria: f.dotacionDiaria, dotacionSem: f.dotacionSem,
              dotacionTotal: f.dotacionTotal, activos: f.activos, tecnicos: f.tecnicos, vacantes: f.vacantes,
            },
          })
        }
      }
    },
    { timeout: 60_000 },
  )

  await marcarSesionCompletada(sesionId, {
    tipo: 'ocupacion_pou',
    totalFilas: filas.length,
  })
}
