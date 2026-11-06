import { Prisma } from '@prisma/client'
import type { ConcursoBandejaItem } from '@srrhh/types'
import { prisma } from '../../shared/prisma.js'
import type { BandejaConcursosQuery } from './concursos.schema.js'

// ─── PASO 1 (flujo concursos): bandeja mixta CPH + CEETPS ───────────────────
// Lee del Concurso BASE (tabla `concursos`) con include a cargo/hospital y LEFT
// JOIN (relación opcional 1:1) a ambas extensiones concursoCph/concursoCeetps.
// Devuelve las columnas COMUNES a ambos tipos + un discriminador `tipo`. NO
// toca listConcursosCphService ni listConcursosCeetpsService: las pantallas
// /concursos/cph y /concursos/ceetps siguen usando sus endpoints intactos.

// Include mínimo: lo necesario para poblar las columnas comunes de la bandeja.
// Se trae la extensión completa de cada tipo para leer estado/subEstado/updatedAt
// según corresponda (un Concurso tiene a lo sumo una de las dos).
const include = {
  cargo: { select: { literalPuesto: true, especialidadLegacy: true } },
  hospital: { select: { sigla: true } },
  concursoCph: { select: { estado: true, subEstado: true, puestoSolicitado: true, especialidadSolicitada: true, updatedAt: true } },
  concursoCeetps: { select: { estado: true, subEstado: true, puestoSolicitado: true, updatedAt: true } },
} satisfies Prisma.ConcursoInclude

type BandejaRow = Prisma.ConcursoGetPayload<{ include: typeof include }>

// ─── Mapper PURO (fila Prisma → ConcursoBandejaItem) ─────────────────────────
// Separado del acceso a datos para testear la unificación CPH/CEETPS sin BD:
// elige la extensión según `tipoConcurso` y expone estado/subEstado como string
// común. Si no hay extensión (dato inconsistente) deja estado/subEstado en null.
export function toBandejaItem(row: BandejaRow): ConcursoBandejaItem {
  const esCph = row.tipoConcurso === 'cph'
  const ext = esCph ? row.concursoCph : row.concursoCeetps

  const puestoExt = esCph
    ? row.concursoCph?.puestoSolicitado ?? null
    : row.concursoCeetps?.puestoSolicitado ?? null

  const ultimoMovimiento = (ext?.updatedAt ?? row.createdAt).toISOString()

  return {
    id: row.id,
    tipo: row.tipoConcurso as ConcursoBandejaItem['tipo'],
    cargoId: row.cargoId,
    hospitalId: row.hospitalId,
    hospitalSigla: row.hospital?.sigla ?? null,
    puesto: row.cargo?.literalPuesto ?? puestoExt,
    especialidad: esCph
      ? row.concursoCph?.especialidadSolicitada ?? row.cargo?.especialidadLegacy ?? null
      : row.cargo?.especialidadLegacy ?? null,
    estado: ext?.estado ?? null,
    subEstado: ext?.subEstado ?? null,
    motivoConcurso: row.motivoConcurso ?? null,
    ultimoMovimiento,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listBandejaConcursosService(query: BandejaConcursosQuery) {
  const { page, limit, hospitalId, tipo, estado, motivo, search } = query
  const offset = (page - 1) * limit

  // El estado es string de la extensión según el tipo. Se filtra sobre la
  // relación 1:1 correspondiente (concursoCph/concursoCeetps). Si se pide estado
  // sin tipo, matchea cuando CUALQUIERA de las dos extensiones lo tenga.
  const estadoWhere: Prisma.ConcursoWhereInput | undefined = estado
    ? tipo === 'cph'
      ? { concursoCph: { estado: estado as never } }
      : tipo === 'ceetps'
        ? { concursoCeetps: { estado: estado as never } }
        : {
            OR: [
              { concursoCph: { estado: estado as never } },
              { concursoCeetps: { estado: estado as never } },
            ],
          }
    : undefined

  const where: Prisma.ConcursoWhereInput = {
    // La bandeja es de concursos reales; `sin_concurso` no se lista.
    tipoConcurso: tipo ?? { in: ['cph', 'ceetps'] },
    ...(hospitalId && { hospitalId }),
    ...(motivo && { motivoConcurso: motivo as never }),
    ...(estadoWhere && estadoWhere),
    ...(search && {
      OR: [
        { expediente: { contains: search, mode: 'insensitive' } },
        { motivo: { contains: search, mode: 'insensitive' } },
        { cargo: { literalPuesto: { contains: search, mode: 'insensitive' } } },
        { hospital: { sigla: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  }

  const [total, rows] = await Promise.all([
    prisma.concurso.count({ where }),
    prisma.concurso.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return {
    data: rows.map(toBandejaItem),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  }
}
