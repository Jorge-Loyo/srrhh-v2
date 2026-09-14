import { createRequire } from 'node:module'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'

// xlsx es CJS — mismo patrón que organigrama.service.ts / bajas-sial.service.ts
// (createRequire porque este proyecto es ESM).
const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as {
  read: (data: Buffer, opts: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> }
  utils: { sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => unknown[][] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Migración legacy (dotacion-rrhh -> v2), puerto simplificado de
// controllers/pouController.js + services/PouService.js + modules/carga-masiva/pou/*.
// Simplificación deliberada respecto a la app vieja (decisión de Agustín): sin
// período/histórico — no hay preview/diff/confirm, cada Excel subido
// reemplaza la tabla `pou` entera, igual que el módulo Árbol del organigrama.
// ─────────────────────────────────────────────────────────────────────────────

export interface PouRow {
  id: string
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

export interface TriangulacionRow {
  sigla: string
  codigo: string
  unificadorPuesto: string | null
  agrupador: string | null
  especialidadLegacy: string | null
  tipoConcurso: string
  fechaVacante: Date
  pouPerfil: string | null
  pouEspecialidad: string | null
  dotacionTotal: number | null
  pouActivos: number | null
  pouVacantes: number | null
  estadoPou: 'CON POU' | 'SIN POU' | 'SUPLENTE' | 'SIN CLASIFICAR'
}

export async function triangularPouService(sigla?: string): Promise<TriangulacionRow[]> {
  const rows = sigla
    ? await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT sigla, codigo, unificador_puesto, agrupador, especialidad_legacy,
               tipo_concurso, fecha_vacante, pou_perfil, pou_especialidad,
               dotacion_total, pou_activos, pou_vacantes, estado_pou
        FROM v_pou_triangulacion
        WHERE sigla = ${sigla}
        ORDER BY estado_pou, codigo`
    : await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT sigla, codigo, unificador_puesto, agrupador, especialidad_legacy,
               tipo_concurso, fecha_vacante, pou_perfil, pou_especialidad,
               dotacion_total, pou_activos, pou_vacantes, estado_pou
        FROM v_pou_triangulacion
        ORDER BY sigla, estado_pou, codigo`
  return rows.map((r) => ({
    sigla: r.sigla as string,
    codigo: r.codigo as string,
    unificadorPuesto: r.unificador_puesto as string | null,
    agrupador: r.agrupador as string | null,
    especialidadLegacy: r.especialidad_legacy as string | null,
    tipoConcurso: r.tipo_concurso as string,
    fechaVacante: r.fecha_vacante as Date,
    pouPerfil: r.pou_perfil as string | null,
    pouEspecialidad: r.pou_especialidad as string | null,
    dotacionTotal: r.dotacion_total as number | null,
    pouActivos: r.pou_activos as number | null,
    pouVacantes: r.pou_vacantes as number | null,
    estadoPou: r.estado_pou as TriangulacionRow['estadoPou'],
  }))
}

export async function listPouPorSiglaService(sigla: string): Promise<PouRow[]> {
  return prisma.pou.findMany({
    where: { sigla },
    orderBy: [{ perfil: 'asc' }, { especialidad: 'asc' }],
  })
}

export async function listHospitalesPouService(): Promise<string[]> {
  const rows = await prisma.pou.findMany({
    distinct: ['sigla'],
    select: { sigla: true },
    orderBy: { sigla: 'asc' },
  })
  return rows.map((r) => r.sigla)
}

export async function compararPouService(siglas: string[]): Promise<PouRow[]> {
  return prisma.pou.findMany({
    where: { sigla: { in: siglas } },
    orderBy: [{ perfil: 'asc' }, { especialidad: 'asc' }, { sigla: 'asc' }],
  })
}

// ── Carga de estructura (módulo admin) ──────────────────────────────────────
// Reemplaza toda la tabla `pou` desde el Excel mensual "Ocupacion_POU" que
// emite RRHH. El archivo real trae 5 hojas; solo "Base" es la fuente (las
// otras son detalle persona por persona, resúmenes o reportes de diferencia
// entre períodos — puerto literal de ese hallazgo, ver pouColumnMapping.js en
// la app vieja). La columna "Vacantes" aparece dos veces en "Base" — se toma
// la primera ocurrencia (columna 10), la segunda (columna 14) se descarta a
// propósito, igual que en la app vieja.

const SHEET_NAME = 'base'
const LOTE_UPLOAD = 500

const COLUMN_MAPPING: { header: string; field: keyof Prisma.PouCreateManyInput; tipo: 'string' | 'int'; occurrence?: number }[] = [
  { header: 'SIGLA', field: 'sigla', tipo: 'string' },
  { header: 'Descrip. Sigla', field: 'descripcionSigla', tipo: 'string' },
  { header: 'PERFIL', field: 'perfil', tipo: 'string' },
  { header: 'ESPECIALIDAD', field: 'especialidad', tipo: 'string' },
  { header: 'Dotación Diaria', field: 'dotacionDiaria', tipo: 'int' },
  { header: 'Dotación Sem', field: 'dotacionSem', tipo: 'int' },
  { header: 'Dotación Total', field: 'dotacionTotal', tipo: 'int' },
  { header: 'Activos', field: 'activos', tipo: 'int' },
  { header: 'Técnicos', field: 'tecnicos', tipo: 'int' },
  { header: 'Vacantes', field: 'vacantes', tipo: 'int', occurrence: 1 },
]

const MAX_LENGTH: Partial<Record<string, number>> = {
  sigla: 10,
  descripcionSigla: 100,
  perfil: 50,
  especialidad: 100,
}

function normalizeCell(raw: unknown, tipo: 'string' | 'int'): string | number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (tipo === 'int') {
    const n = parseInt(String(raw).trim(), 10)
    return Number.isNaN(n) ? null : n
  }
  const s = String(raw).trim()
  return s === '' ? null : s
}

// Resuelve, para cada campo del mapeo, en qué columna está — por "ocurrencia N
// del header" en vez de nombre puro, porque "Vacantes" aparece dos veces.
function resolveColumns(headerRow: unknown[]): { mapping: (typeof COLUMN_MAPPING)[number]; colIndex: number | null }[] {
  const seen = new Map<string, number>()
  const indexByHeaderOccurrence = new Map<string, number>() // `${header}#${occurrence}` -> colIndex
  headerRow.forEach((raw, colIndex) => {
    const header = String(raw ?? '').trim()
    if (!header) return
    const occurrence = (seen.get(header) ?? 0) + 1
    seen.set(header, occurrence)
    indexByHeaderOccurrence.set(`${header}#${occurrence}`, colIndex)
  })

  return COLUMN_MAPPING.map((mapping) => ({
    mapping,
    colIndex: indexByHeaderOccurrence.get(`${mapping.header}#${mapping.occurrence ?? 1}`) ?? null,
  }))
}

export interface PouCarga {
  id: string
  archivo: string
  filas: number
  usuarioId: string | null
  createdAt: Date
}

export async function listPouCargasService(): Promise<PouCarga[]> {
  return prisma.$queryRaw<PouCarga[]>`
    SELECT pc.id, pc.archivo, pc.filas, pc.usuario_id AS "usuarioId", pc.created_at AS "createdAt",
           u.username
    FROM pou_cargas pc
    LEFT JOIN usuarios u ON u.id = pc.usuario_id
    ORDER BY pc.created_at DESC
    LIMIT 20
  `
}

export async function reemplazarPouService(buffer: Buffer, nombreArchivo: string, usuarioId?: string): Promise<{ filas: number }> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  if (!wb.SheetNames.length) throw AppError.badRequest('El archivo no tiene ninguna hoja')

  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === SHEET_NAME)
  if (!sheetName) {
    throw AppError.badRequest(`El archivo no tiene una hoja llamada "Base" (hojas encontradas: ${wb.SheetNames.join(', ')})`)
  }
  const filasCrudas = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  if (filasCrudas.length < 2) throw AppError.badRequest('La hoja "Base" no tiene filas de datos')

  const resolved = resolveColumns(filasCrudas[0]!)
  const faltantesHeader = resolved.filter((r) => r.colIndex === null).map((r) => r.mapping.header)
  if (faltantesHeader.length) {
    throw AppError.badRequest(`Faltan columnas en la hoja "Base": ${faltantesHeader.join(', ')}`)
  }

  const filas: Prisma.PouCreateManyInput[] = []
  const vistos = new Set<string>()

  // La fila 1 es el header; el resto son datos (numeroFila = 1-based, igual que el Excel).
  for (let i = 1; i < filasCrudas.length; i++) {
    const fila = filasCrudas[i]!
    const numeroFila = i + 1
    const valores: Record<string, string | number | null> = {}
    for (const { mapping, colIndex } of resolved) {
      valores[mapping.field] = normalizeCell(fila[colIndex!], mapping.tipo)
    }

    // Fila vacía (las 3 columnas clave sin datos) — se descarta en silencio, igual que la app vieja.
    if (!valores.sigla && !valores.perfil && !valores.especialidad) continue

    const faltantes = (['sigla', 'perfil', 'especialidad'] as const).filter((k) => valores[k] === null)
    if (faltantes.length) {
      throw AppError.badRequest(`Fila ${numeroFila}: faltan columnas obligatorias (${faltantes.join(', ')})`)
    }
    for (const [campo, max] of Object.entries(MAX_LENGTH)) {
      const v = valores[campo]
      if (typeof v === 'string' && v.length > max!) {
        throw AppError.badRequest(`Fila ${numeroFila}: "${campo}" excede el largo máximo (${max})`)
      }
    }

    const key = `${valores.sigla}::${valores.perfil}::${valores.especialidad}`
    if (vistos.has(key)) {
      throw AppError.badRequest(`Fila ${numeroFila}: combinación sigla+perfil+especialidad duplicada en el archivo (${key})`)
    }
    vistos.add(key)

    filas.push({
      sigla: valores.sigla as string,
      descripcionSigla: valores.descripcionSigla as string | null,
      perfil: valores.perfil as string,
      especialidad: valores.especialidad as string,
      dotacionDiaria: valores.dotacionDiaria as number | null,
      dotacionSem: valores.dotacionSem as number | null,
      dotacionTotal: valores.dotacionTotal as number | null,
      activos: valores.activos as number | null,
      tecnicos: valores.tecnicos as number | null,
      vacantes: valores.vacantes as number | null,
    })
  }

  if (filas.length === 0) throw AppError.badRequest('El archivo no tiene filas de datos válidas')

  // Sin $transaction envolvente a propósito — mismo criterio que
  // reemplazarOrganigramaService: son miles de filas potenciales y el timeout
  // default de una transacción interactiva de Prisma es 5s.
  await prisma.pou.deleteMany()
  for (let i = 0; i < filas.length; i += LOTE_UPLOAD) {
    await prisma.pou.createMany({ data: filas.slice(i, i + LOTE_UPLOAD) })
  }

  await prisma.$executeRaw`
    INSERT INTO pou_cargas (archivo, filas, usuario_id)
    VALUES (${nombreArchivo}, ${filas.length}, ${usuarioId ?? null}::uuid)
  `

  return { filas: filas.length }
}
