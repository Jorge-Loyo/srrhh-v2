import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { tipoConcursoDeCargo } from '../incidencias/incidencias.gestionable.js'
import type { NuevosCargosQuery } from './cargos.schema.js'

// ─── Paso 4 flujo concursos: pestaña "Nuevos cargos" ────────────────────────
// Lista los CONCURSOS DE CARGOS NUEVOS que ningún usuario inició todavía, para
// "caratular y mandar a autorizar". Los concursos los crea solos la aprobación
// del alta (Paso 3, crearConcursosAltaAutomaticaTx): motivo_concurso =
// 'nuevo_cargo', autorizado_at NULL, expediente del alta en Concurso.expediente.
// "Caratular" no crea nada: abre el concurso en su Etapa 1.
//
// CRITERIO DE "SIN INICIAR" (usa el estado calculado, no un flag nuevo):
//   - Concurso.motivoConcurso = 'nuevo_cargo' AND Concurso.autorizadoAt IS NULL
//   - CPH:    ConcursoCph.estado = 'no_iniciado' (calcConcursoCph: sin eeConcurso
//             ni resolución) AND suspendido = false. Con Etapa 1 guardada
//             (eeConcurso + IF) el estado pasa a 'activo' y sale de la lista.
//   - CEETPS: ConcursoCeetps.estado = 'sin_autorizar' AND sin expedienteConcurso
//             ni fechaCaratulacion (calcEstadoCeetps: con expediente queda
//             EXP_CARATULADO / A_AUTORIZACION). Son los dos campos que la Etapa 1
//             completa; el expediente del alta vive en Concurso.expediente.
//   - Sin solicitud de autorización: no hace falta chequearla aparte, pedir la
//     autorización exige la Etapa 1 completa (expediente), que ya los excluye.
// El expediente del alta (Concurso.expediente, o el del cargo si faltara) es la
// clave de agrupación: una alta con N cargos = N concursos con el mismo expediente.
//
// Además se devuelven, aparte, los CARGOS NUEVOS SIN CONCURSO (`sinConcurso`):
// cargos de alta (idSial MANUAL-%, expediente cargado, vigente/vacante) sin
// ninguna fila en `concursos`. Motivos: 'sin_tipo' (CR fuera de CPH/CEETPS, la
// aprobación no crea concurso) o 'sin_concurso' (alta aprobada antes del Paso 3).
// No se crea concurso para ellos: son informativos (el Paso 5 define el tipo).

// Tope defensivo del listado (el volumen real de pendientes es de decenas).
const MAX_ITEMS = 500

export interface NuevoCargoItem {
  concursoId: string
  /** id para navegar: ConcursoCph.id o ConcursoCeetps.id (según `tipo`). */
  detalleId: string
  tipo: 'cph' | 'ceetps'
  expediente: string | null
  hospital: { id: string; sigla: string } | null
  puesto: string | null
  especialidad: string | null
  carrera: string | null
  cargo: { id: string; codigo: string | null; idSial: string | null }
  etiquetas: { id: string; nombre: string; color: string | null }[]
  /** Fecha en que se aprobó el alta (creación automática del concurso). */
  fechaAlta: string
}

export interface NuevoCargoGrupo {
  expediente: string | null
  cantidad: number
  fechaAlta: string
  items: NuevoCargoItem[]
}

export interface NuevoCargoSinConcurso {
  cargoId: string
  codigo: string | null
  idSial: string | null
  expediente: string | null
  hospital: { id: string; sigla: string } | null
  puesto: string | null
  especialidad: string | null
  carrera: string | null
  codigoRegistro: string | null
  motivo: 'sin_tipo' | 'sin_concurso'
  fechaAlta: string
}

type Tipo = 'cph' | 'ceetps'

const cargoInclude = {
  hospital: { select: { id: true, sigla: true } },
  escalafon: { select: { nombre: true } },
  puestoCargo: { select: { nombre: true } },
  especialidadPuesto: { select: { nombre: true } },
  etiquetas: { select: { etiqueta: { select: { id: true, nombre: true, color: true } } } },
} satisfies Prisma.CargoInclude

type CargoRow = Prisma.CargoGetPayload<{ include: typeof cargoInclude }>

function textoCargo(cargo: CargoRow) {
  return {
    puesto: cargo.puestoCargo?.nombre ?? cargo.literalPuesto ?? null,
    especialidad: cargo.especialidadPuesto?.nombre ?? cargo.especialidadLegacy ?? null,
    carrera: cargo.escalafon?.nombre ?? null,
  }
}

/** Filtro de búsqueda sobre el cargo (código, puesto, especialidad) del concurso. */
function cargoSearch(search: string): Prisma.CargoWhereInput {
  return {
    OR: [
      { codigo: { contains: search, mode: 'insensitive' } },
      { literalPuesto: { contains: search, mode: 'insensitive' } },
      { especialidadLegacy: { contains: search, mode: 'insensitive' } },
      { puestoCargo: { nombre: { contains: search, mode: 'insensitive' } } },
      { especialidadPuesto: { nombre: { contains: search, mode: 'insensitive' } } },
      { etiquetas: { some: { etiqueta: { nombre: { contains: search, mode: 'insensitive' } } } } },
    ],
  }
}

function concursoWhere(search: string | undefined): Prisma.ConcursoWhereInput {
  return {
    motivoConcurso: 'nuevo_cargo',
    autorizadoAt: null,
    ...(search && {
      OR: [
        { expediente: { contains: search, mode: 'insensitive' } },
        { cargo: { expediente: { contains: search, mode: 'insensitive' } } },
        { cargo: cargoSearch(search) },
      ],
    }),
  }
}

/**
 * PURO: agrupa los items por expediente del alta (varios cargos por alta).
 * Orden: grupos con alta más reciente primero; dentro del grupo, por código.
 * Los items sin expediente van juntos en un grupo `expediente: null`.
 */
export function agruparNuevosCargos(items: NuevoCargoItem[]): NuevoCargoGrupo[] {
  const mapa = new Map<string, NuevoCargoItem[]>()
  for (const it of items) {
    const clave = it.expediente ?? ''
    const lista = mapa.get(clave)
    if (lista) lista.push(it)
    else mapa.set(clave, [it])
  }
  const grupos: NuevoCargoGrupo[] = []
  for (const [clave, lista] of mapa) {
    const ordenados = [...lista].sort((a, b) =>
      (a.cargo.codigo ?? '').localeCompare(b.cargo.codigo ?? ''),
    )
    const fechaAlta = ordenados.reduce(
      (min, it) => (it.fechaAlta < min ? it.fechaAlta : min),
      ordenados[0]!.fechaAlta,
    )
    grupos.push({ expediente: clave === '' ? null : clave, cantidad: ordenados.length, fechaAlta, items: ordenados })
  }
  return grupos.sort((a, b) => (a.fechaAlta < b.fechaAlta ? 1 : a.fechaAlta > b.fechaAlta ? -1 : 0))
}

export async function listNuevosCargosService(query: NuevosCargosQuery) {
  const { search, hospitalId, tipo } = query
  const incluirCph = !tipo || tipo === 'cph'
  const incluirCeetps = !tipo || tipo === 'ceetps'
  const base = {
    ...(hospitalId && { hospitalId }),
    concurso: concursoWhere(search),
    cargo: { deletedAt: null },
  }
  const includeComun = {
    concurso: { select: { id: true, expediente: true, createdAt: true } },
    cargo: { include: cargoInclude },
  } satisfies Prisma.ConcursoCphInclude

  const [cphRows, ceetpsRows] = await Promise.all([
    incluirCph
      ? prisma.concursoCph.findMany({
          where: { ...base, estado: 'no_iniciado', suspendido: false },
          include: includeComun,
          take: MAX_ITEMS,
        })
      : Promise.resolve([]),
    incluirCeetps
      ? prisma.concursoCeetps.findMany({
          where: { ...base, estado: 'sin_autorizar' },
          include: includeComun,
          take: MAX_ITEMS,
        })
      : Promise.resolve([]),
  ])

  const aItem = (
    tipoItem: Tipo,
    r: (typeof cphRows)[number] | (typeof ceetpsRows)[number],
  ): NuevoCargoItem => ({
    concursoId: r.concurso.id,
    detalleId: r.id,
    tipo: tipoItem,
    expediente: r.concurso.expediente || r.cargo.expediente || null,
    hospital: r.cargo.hospital,
    ...textoCargo(r.cargo),
    cargo: { id: r.cargo.id, codigo: r.cargo.codigo, idSial: r.cargo.idSial },
    etiquetas: r.cargo.etiquetas.map((e) => e.etiqueta),
    fechaAlta: r.concurso.createdAt.toISOString(),
  })

  const items: NuevoCargoItem[] = [
    ...cphRows.filter((r) => !r.eeConcurso).map((r) => aItem('cph', r)),
    ...ceetpsRows.filter((r) => !r.expedienteConcurso && !r.fechaCaratulacion).map((r) => aItem('ceetps', r)),
  ]

  // Cargos nuevos sin concurso (informativo). Con filtro de tipo solo los que
  // clasifican en ese tipo (los 'sin_tipo' no pertenecen a ninguno).
  const cargosSin = await prisma.cargo.findMany({
    where: {
      idSial: { startsWith: 'MANUAL-' },
      expediente: { not: null, notIn: [''] },
      estado: 'vigente',
      subEstado: 'vacante',
      deletedAt: null,
      concursos: { none: {} },
      ...(hospitalId && { hospitalId }),
      ...(search && {
        OR: [{ expediente: { contains: search, mode: 'insensitive' } }, ...(cargoSearch(search).OR ?? [])],
      }),
    },
    include: { ...cargoInclude, codigoRegistro: { select: { codigo: true } } },
    orderBy: [{ createdAt: 'desc' }],
    take: MAX_ITEMS,
  })
  const sinConcurso: NuevoCargoSinConcurso[] = []
  for (const c of cargosSin) {
    const t = tipoConcursoDeCargo({ codigoRegistro: c.codigoRegistro?.codigo ?? null, literalPuesto: c.literalPuesto })
    if (tipo && t !== tipo) continue
    sinConcurso.push({
      cargoId: c.id,
      codigo: c.codigo,
      idSial: c.idSial,
      expediente: c.expediente,
      hospital: c.hospital,
      ...textoCargo(c),
      codigoRegistro: c.codigoRegistro?.codigo ?? null,
      motivo: t === null ? 'sin_tipo' : 'sin_concurso',
      fechaAlta: c.createdAt.toISOString(),
    })
  }

  const data = agruparNuevosCargos(items)
  return {
    data,
    sinConcurso,
    meta: { total: items.length, grupos: data.length, sinConcurso: sinConcurso.length },
  }
}
