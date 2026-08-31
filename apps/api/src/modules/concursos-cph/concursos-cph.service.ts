import { Prisma, type ConcursoCph } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { ConcursosCphQuery, PatchConcursoCphBody, SuspenderConcursoCphBody } from './concursos-cph.schema.js'
import { calcConcursoCph, SUB_ESTADO_3_SQL_PG, type ConcursoCphCalcInput } from './concursosCph.calc.js'

const include = {
  concurso: { include: { cargo: { include: { hospital: true, codigoRegistro: true } }, persona: true, baja: true } },
  hospital: true,
  personaDesignada: true,
} satisfies Prisma.ConcursoCphInclude

// Extrae los campos que usa calcConcursoCph() de una fila completa —
// reutilizado por patch/suspender (ambos parten de la fila existente y
// pisan solo lo que cambió) para no repetir la lista de campos dos veces.
function toCalcInput(row: ConcursoCph): ConcursoCphCalcInput {
  return {
    suspendido: row.suspendido,
    eeBaja: row.eeBaja,
    fechaBaja: row.fechaBaja,
    eeConcurso: row.eeConcurso,
    fechaEeConcurso: row.fechaEeConcurso,
    fechaAutorizacion: row.fechaAutorizacion,
    sorteoJurado: row.sorteoJurado,
    disposicion: row.disposicion,
    fechaInscHasta: row.fechaInscHasta,
    fechaExamen: row.fechaExamen,
    fechaOrdenMerito: row.fechaOrdenMerito,
    fechaIfacs: row.fechaIfacs,
    fechaInsal: row.fechaInsal,
    eeDesignacion: row.eeDesignacion,
    cargaDocumentacion: row.cargaDocumentacion,
    fechaAptoMedico: row.fechaAptoMedico,
    fechaIte: row.fechaIte,
    proyectoResolucion: row.proyectoResolucion,
    resoALaFirma: row.resoALaFirma,
    resolucionDesignacion: row.resolucionDesignacion,
    fechaResolucion: row.fechaResolucion,
    cargoSial: row.cargoSial,
    dispoDesierta: row.dispoDesierta,
    fechaDispoDesierta: row.fechaDispoDesierta,
  }
}

// ─── S4-1: listado paginado con filtros ─────────────────────────────────────
export async function listConcursosCphService(query: ConcursosCphQuery) {
  const { page, limit, hospitalId, cargoId, estado, subEstado, subEstado3, suspendido, search } = query
  const offset = (page - 1) * limit

  // subEstado3 depende de la fecha de hoy (ver concursosCph.calc.ts) — el
  // valor guardado puede haberse desactualizado solo con el paso del tiempo,
  // así que se recalcula en SQL al filtrar, mismo patrón que
  // cargos.service.ts usa para resolver ids vía $queryRaw antes del where
  // tipado de Prisma.
  let subEstado3Ids: string[] | undefined
  if (subEstado3) {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM concursos_cph WHERE (${Prisma.raw(SUB_ESTADO_3_SQL_PG)}) = ${subEstado3}
    `)
    subEstado3Ids = rows.map((r) => r.id)
  }

  const where: Prisma.ConcursoCphWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(cargoId && { cargoId }),
    ...(estado && { estado }),
    ...(subEstado && { subEstado }),
    ...(suspendido !== undefined && { suspendido }),
    ...(subEstado3Ids && { id: { in: subEstado3Ids } }),
    ...(search && {
      OR: [
        { eeBaja: { contains: search, mode: 'insensitive' } },
        { eeConcurso: { contains: search, mode: 'insensitive' } },
        { especialidadSolicitada: { contains: search, mode: 'insensitive' } },
        { resolucionDesignacion: { contains: search, mode: 'insensitive' } },
        { observaciones: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [total, data] = await Promise.all([
    prisma.concursoCph.count({ where }),
    prisma.concursoCph.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S4-2: detalle completo ──────────────────────────────────────────────────
export async function getConcursoCphByIdService(id: string) {
  const concursoCph = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!concursoCph) throw AppError.notFound('Concurso CPH no encontrado')
  return concursoCph
}

// Campos de tipo fecha del PATCH — explícito en vez de heurística por nombre
// (`key.startsWith('fecha')` se probó y falla para `sorteoJurado`, que es
// fecha pero no arranca con ese prefijo: la columna quedaba con el string
// "YYYY-MM-DD" crudo en vez de un Date, y Prisma lo rechazaba en runtime con
// "premature end of input. Expected ISO-8601 DateTime" — tsc no lo detecta
// porque PatchConcursoCphBody tipa las fechas como `string`, igual que
// cualquier otro campo de texto).
const CAMPOS_FECHA = new Set<keyof PatchConcursoCphBody>([
  'fechaBaja',
  'fechaEeConcurso',
  'fechaAutorizacion',
  'sorteoJurado',
  'fechaInscDesde',
  'fechaInscHasta',
  'fechaExamen',
  'fechaOrdenMerito',
  'fechaIfacs',
  'fechaInsal',
  'fechaAptoMedico',
  'fechaIte',
  'fechaResolucion',
  'fechaDispoDesierta',
])

// ─── S4-3: actualizar campos por fase — estado/subEstado se recalculan ──────
export async function patchConcursoCphService(id: string, body: PatchConcursoCphBody) {
  const existing = await prisma.concursoCph.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')

  const patch: Prisma.ConcursoCphUpdateInput = {}
  for (const [key, value] of Object.entries(body) as [keyof PatchConcursoCphBody, unknown][]) {
    if (value === undefined) continue
    const isFecha = CAMPOS_FECHA.has(key)
    ;(patch as Record<string, unknown>)[key] = isFecha && typeof value === 'string' ? new Date(value) : value
  }

  const merged = toCalcInput({ ...existing, ...(patch as Partial<ConcursoCph>) } as ConcursoCph)
  const calc = calcConcursoCph(merged)

  return prisma.concursoCph.update({
    where: { id },
    data: {
      ...patch,
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
    include,
  })
}

// ─── S4-5: suspender / reanudar ──────────────────────────────────────────────
export async function suspenderConcursoCphService(id: string, body: SuspenderConcursoCphBody) {
  const existing = await prisma.concursoCph.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')
  // Un concurso finalizado o desierto no se puede suspender ni reanudar —
  // suspender solo tiene sentido sobre un concurso activo o no_iniciado.
  if (existing.estado === 'finalizado' || existing.estado === 'desierto') {
    throw AppError.conflict(`No se puede modificar el estado de un concurso ${existing.estado}`)
  }
  if (existing.suspendido === body.suspendido) {
    throw AppError.conflict(
      body.suspendido ? 'El concurso ya está suspendido' : 'El concurso no está suspendido'
    )
  }

  const merged = toCalcInput({ ...existing, suspendido: body.suspendido })
  const calc = calcConcursoCph(merged)

  return prisma.concursoCph.update({
    where: { id },
    data: {
      suspendido: body.suspendido,
      ...(body.observaciones !== undefined && { observaciones: body.observaciones }),
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
    include,
  })
}
