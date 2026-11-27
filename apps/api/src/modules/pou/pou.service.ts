import { createRequire } from 'node:module'
import type { Prisma } from '@prisma/client'
import { normalizarTexto } from '@srrhh/normalizacion'
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
  estadoCargo: string
  subEstado: string | null
  unificadorPuesto: string | null
  agrupador: string | null
  especialidadLegacy: string | null
  fechaVacante: Date | null
  tieneConcurso: boolean
  tipoConcurso: string | null
  pouPerfil: string | null
  pouEspecialidad: string | null
  dotacionTotal: number | null
  pouActivos: number | null
  pouVacantes: number | null
  estadoPou: 'CON POU' | 'SIN POU' | 'SUPLENTE' | 'SIN CLASIFICAR'
}

// ── Comparación POU vs sistema ──────────────────────────────────────────────
// Devuelve filas agrupadas por sigla+perfil+especialidad con conteos del
// documento POU y conteos reales de cargos CPH-G* en el sistema.
// Solo incluye cargos POU: CPH-G, CPH-G-NM, CPH-G-J (guardia + jefes guardia).

export interface ComparacionPouRow {
  sigla: string
  perfil: string
  especialidad: string
  // Documento POU
  pouDotacion: number
  pouActivos: number
  pouVacantes: number
  // Sistema (cargos CPH-G* vigentes + validacion_vacante)
  sistemaTotal: number
  sistemaOcupado: number
  sistemaVacante: number
  sistemaConcurso: number
  sistemaValidacion: number
  // Diferencia: pouDotacion - sistemaTotal (negativo = más cargos que POU)
  diferencia: number
  // true = fila viene del documento POU; false = cargos en sistema sin fila POU
  enNorma: boolean
}

// Mapeo de literal_puesto del cargo → (perfil, especialidad) del documento POU.
// Los CPH-G tienen unificador_puesto='POU Guardia' y agrupador=NULL, por lo que
// el matcheo se hace exclusivamente por literal_puesto.
const CASE_PERFIL = `
  CASE UPPER(c.literal_puesto)
    WHEN 'ESPECIALISTA EN LA GUARDIA MEDICO' THEN 'especialista en la guardia medico'
    WHEN 'PROFESIONAL GUARDIA MEDICO'        THEN 'profesional de la guardia medico'
    WHEN 'KINESIOLOGO DE GUARDIA'            THEN 'profesional de la salud'
    WHEN 'BIOQUIMICO DE GUARDIA'             THEN 'profesional de la salud'
    WHEN 'FARMACEUTICO DE GUARDIA'           THEN 'profesional de la salud'
    WHEN 'OBSTETRICA DE GUARDIA'             THEN 'profesional de la salud'
    WHEN 'PSICOLOGO DE GUARDIA'              THEN 'profesional de la salud'
    WHEN 'ASISTENTE SOCIAL DE GUARDIA'       THEN 'profesional de la salud'
    WHEN 'TRABAJADOR SOCIAL DE GUARDIA'      THEN 'profesional de la salud'
    WHEN 'ODONTOLOGO DE GUARDIA'             THEN 'profesional de la salud'
    WHEN 'BACTERIOLOGO DE GUARDIA'           THEN 'profesional de la salud'
    WHEN 'FONOAUDIOLOGO DE GUARDIA'          THEN 'profesional de la salud'
    WHEN 'TERAPISTA OCUPACIONAL DE GUARDIA'  THEN 'profesional de la salud'
    ELSE CASE
      WHEN UPPER(c.literal_puesto) LIKE 'JEFE%UNIDAD%'  THEN 'jefe de unidad'
      WHEN UPPER(c.literal_puesto) LIKE 'JEFE%SECCION%' THEN 'jefe de seccion'
      ELSE NULL
    END
  END
`

const CASE_ESPECIALIDAD = `
  CASE UPPER(c.literal_puesto)
    WHEN 'ESPECIALISTA EN LA GUARDIA MEDICO' THEN unaccent(lower(COALESCE(c.especialidad_legacy,'')))
    WHEN 'PROFESIONAL GUARDIA MEDICO'        THEN 'sin especialidad'
    WHEN 'KINESIOLOGO DE GUARDIA'            THEN 'kinesiologo/a'
    WHEN 'BIOQUIMICO DE GUARDIA'             THEN 'bioquimico/a'
    WHEN 'FARMACEUTICO DE GUARDIA'           THEN 'farmaceutico/a'
    WHEN 'OBSTETRICA DE GUARDIA'             THEN 'obstetrica'
    WHEN 'PSICOLOGO DE GUARDIA'              THEN 'psicologo/a'
    WHEN 'ASISTENTE SOCIAL DE GUARDIA'       THEN 'trabajador/a social'
    WHEN 'TRABAJADOR SOCIAL DE GUARDIA'      THEN 'trabajador/a social'
    WHEN 'ODONTOLOGO DE GUARDIA'             THEN 'odontologo/a'
    WHEN 'BACTERIOLOGO DE GUARDIA'           THEN 'bacteriologo/a'
    WHEN 'FONOAUDIOLOGO DE GUARDIA'          THEN 'fonoaudiologia'
    WHEN 'TERAPISTA OCUPACIONAL DE GUARDIA'  THEN 'terapia ocupacional'
    ELSE CASE
      WHEN UPPER(c.literal_puesto) LIKE 'JEFE%UNIDAD%'  THEN 'jefe de unidad'
      WHEN UPPER(c.literal_puesto) LIKE 'JEFE%SECCION%' THEN 'jefe de seccion'
      ELSE NULL
    END
  END
`

export interface ComparacionDetalleCargo {
  codigo: string
  estado: string
  subEstado: string | null
  especialidadLegacy: string | null
  ocupanteNombre: string | null
  ocupanteCuil: string | null
  ocupanteIdSial: string | null
}

export async function detalleCargosComparacionService(
  sigla: string, perfil: string, especialidad: string
): Promise<ComparacionDetalleCargo[]> {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
    SELECT c.codigo, c.estado::text, c.sub_estado::text AS sub_estado,
           c.especialidad_legacy,
           p.apellido_nombre AS ocupante_nombre,
           o.cuil AS ocupante_cuil,
           o.id_sial_rol AS ocupante_id_sial
    FROM cargos c
    JOIN hospitales h ON h.id = c.hospital_id
    LEFT JOIN ocupaciones o ON o.cargo_id = c.id AND o.hasta IS NULL
    LEFT JOIN personas p ON p.id = o.persona_id
    WHERE h.sigla = $1
      AND c.unificador_puesto = 'POU Guardia'
      AND c.estado IN ('vigente','validacion_vacante')
      AND c.deleted_at IS NULL
      AND ${CASE_PERFIL} = $2
      AND ${CASE_ESPECIALIDAD} = $3
    ORDER BY c.codigo
  `, sigla, perfil, especialidad)

  return rows.map((r) => ({
    codigo:           r.codigo as string,
    estado:           r.estado as string,
    subEstado:        r.sub_estado as string | null,
    especialidadLegacy: r.especialidad_legacy as string | null,
    ocupanteNombre:   r.ocupante_nombre as string | null,
    ocupanteCuil:     r.ocupante_cuil as string | null,
    ocupanteIdSial:   r.ocupante_id_sial as string | null,
  }))
}

export async function comparacionPouService(siglas?: string[]): Promise<ComparacionPouRow[]> {
  const conFiltro = siglas && siglas.length > 0

  // $queryRawUnsafe porque la query mezcla SQL estático (CASE) con parámetros
  // dinámicos (siglas). Los CASE son constantes del módulo — sin input de usuario.
  // Las siglas vienen del route ya validadas (split+trim+toUpperCase+Set).
  const filtroSiglaCC = conFiltro
    ? `AND h.sigla = ANY(ARRAY[${siglas!.map((_, i) => `$${i + 1}`).join(',')}])`
    : ''
  const filtroPou = conFiltro
    ? `WHERE p.sigla = ANY(ARRAY[${siglas!.map((_, i) => `$${i + 1}`).join(',')}])`
    : ''
  const params: string[] = conFiltro ? siglas! : []

  const sql = `
    WITH cargos_clasificados AS (
      SELECT h.sigla,
             ${CASE_PERFIL}       AS pou_perfil,
             ${CASE_ESPECIALIDAD} AS pou_especialidad,
             c.sub_estado, c.estado
      FROM cargos c
      JOIN hospitales h ON h.id = c.hospital_id
      WHERE c.unificador_puesto = 'POU Guardia'
        AND c.estado IN ('vigente','validacion_vacante')
        AND c.deleted_at IS NULL
        ${filtroSiglaCC}
    ),
    cargos_sistema AS (
      SELECT sigla, pou_perfil, pou_especialidad,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE sub_estado = 'ocupado')::int    AS ocupado,
             COUNT(*) FILTER (WHERE sub_estado = 'vacante')::int    AS vacante,
             COUNT(*) FILTER (WHERE sub_estado = 'concurso')::int   AS concurso,
             COUNT(*) FILTER (WHERE estado = 'validacion_vacante')::int AS validacion
      FROM cargos_clasificados
      WHERE pou_perfil IS NOT NULL
      GROUP BY sigla, pou_perfil, pou_especialidad
    ),
    cargos_pou AS (
      SELECT h.sigla, p.perfil AS pou_perfil, p.especialidad AS pou_especialidad,
             p.dotacion_total AS pou_dotacion, p.activos AS pou_activos, p.vacantes AS pou_vacantes
      FROM pou p
      JOIN hospitales h ON h.sigla = p.sigla
      ${filtroPou}
    )
    -- Cargos en sistema que no matchearon ninguna fila POU (pou_perfil IS NULL)
    cargos_sin_norma AS (
      SELECT sigla, pou_especialidad,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE sub_estado = 'ocupado')::int    AS ocupado,
             COUNT(*) FILTER (WHERE sub_estado = 'vacante')::int    AS vacante,
             COUNT(*) FILTER (WHERE sub_estado = 'concurso')::int   AS concurso,
             COUNT(*) FILTER (WHERE estado = 'validacion_vacante')::int AS validacion
      FROM cargos_clasificados
      WHERE pou_perfil IS NULL AND pou_especialidad IS NOT NULL
      GROUP BY sigla, pou_especialidad
    )
    SELECT cp.sigla, cp.pou_perfil AS perfil, cp.pou_especialidad AS especialidad,
           COALESCE(cp.pou_dotacion,0) AS pou_dotacion, COALESCE(cp.pou_activos,0) AS pou_activos,
           COALESCE(cp.pou_vacantes,0) AS pou_vacantes, COALESCE(cs.total,0) AS sistema_total,
           COALESCE(cs.ocupado,0) AS sistema_ocupado, COALESCE(cs.vacante,0) AS sistema_vacante,
           COALESCE(cs.concurso,0) AS sistema_concurso, COALESCE(cs.validacion,0) AS sistema_validacion,
           COALESCE(cp.pou_dotacion,0) - COALESCE(cs.total,0) AS diferencia,
           true AS en_norma
    FROM cargos_pou cp
    LEFT JOIN cargos_sistema cs
      ON cs.sigla = cp.sigla AND cs.pou_perfil = cp.pou_perfil AND cs.pou_especialidad = cp.pou_especialidad
    UNION ALL
    SELECT csn.sigla, 'especialista en la guardia medico' AS perfil, csn.pou_especialidad AS especialidad,
           0 AS pou_dotacion, 0 AS pou_activos, 0 AS pou_vacantes,
           csn.total AS sistema_total, csn.ocupado AS sistema_ocupado, csn.vacante AS sistema_vacante,
           csn.concurso AS sistema_concurso, csn.validacion AS sistema_validacion,
           0 - csn.total AS diferencia,
           false AS en_norma
    FROM cargos_sin_norma csn
    ORDER BY sigla, perfil, especialidad
  `

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params)

  return rows.map((r) => ({
    sigla:             r.sigla as string,
    perfil:            r.perfil as string,
    especialidad:      r.especialidad as string,
    pouDotacion:       Number(r.pou_dotacion),
    pouActivos:        Number(r.pou_activos),
    pouVacantes:       Number(r.pou_vacantes),
    sistemaTotal:      Number(r.sistema_total),
    sistemaOcupado:    Number(r.sistema_ocupado),
    sistemaVacante:    Number(r.sistema_vacante),
    sistemaConcurso:   Number(r.sistema_concurso),
    sistemaValidacion: Number(r.sistema_validacion),
    diferencia:        Number(r.diferencia),
    enNorma:           Boolean(r.en_norma),
  }))
}

export async function triangularPouService(sigla?: string): Promise<TriangulacionRow[]> {
  const rows = sigla
    ? await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT sigla, codigo, estado_cargo, sub_estado, unificador_puesto, agrupador,
               especialidad_legacy, fecha_vacante, tiene_concurso, tipo_concurso,
               pou_perfil, pou_especialidad, dotacion_total, pou_activos, pou_vacantes, estado_pou
        FROM v_pou_triangulacion
        WHERE sigla = ${sigla}`
    : await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT sigla, codigo, estado_cargo, sub_estado, unificador_puesto, agrupador,
               especialidad_legacy, fecha_vacante, tiene_concurso, tipo_concurso,
               pou_perfil, pou_especialidad, dotacion_total, pou_activos, pou_vacantes, estado_pou
        FROM v_pou_triangulacion`
  return rows.map((r) => ({
    sigla: r.sigla as string,
    codigo: r.codigo as string,
    estadoCargo: r.estado_cargo as string,
    subEstado: r.sub_estado as string | null,
    unificadorPuesto: r.unificador_puesto as string | null,
    agrupador: r.agrupador as string | null,
    especialidadLegacy: r.especialidad_legacy as string | null,
    fechaVacante: r.fecha_vacante as Date | null,
    tieneConcurso: r.tiene_concurso as boolean,
    tipoConcurso: r.tipo_concurso as string | null,
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

    // A21-10: normalizar los campos de texto de negocio (minúscula/sin tilde)
    // ANTES del dedup y la validación, para que el colapso por casing sea
    // consistente. La sigla se deja como código (solo trim de normalizeCell).
    for (const campo of ['perfil', 'especialidad', 'descripcionSigla'] as const) {
      if (typeof valores[campo] === 'string') valores[campo] = normalizarTexto(valores[campo] as string) || null
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
      // A21-10: perfil/especialidad/descripcionSigla ya vienen normalizados
      // (arriba, antes del dedup); sigla se deja como código.
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
