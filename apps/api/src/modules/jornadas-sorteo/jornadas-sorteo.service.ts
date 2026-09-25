import { prisma } from '../../shared/prisma.js'
import { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError.js'
import type { CrearJornadaBody, CandidatosJornadaQuery } from './jornadas-sorteo.schema.js'

// Sub-estado en el que un concurso está listo para sortear jurado (Etapa 2).
const SUB_ESTADO_SORTEO = 'B-SORTEO JUR'

// Resumen de un concurso para mostrar en candidatos / detalle de jornada.
const concursoSelect = {
  id: true,
  subEstado: true,
  especialidadSolicitada: true,
  puestoSolicitado: true,
  eeConcurso: true,
  suspendido: true,
  concurso: {
    select: {
      cargo: { select: { codigo: true, literalPuesto: true } },
      hospital: { select: { sigla: true, nombre: true } },
    },
  },
  etiquetas: { select: { etiqueta: { select: { id: true, nombre: true } } } },
  // Último sorteo de jurado (para el avance): el vigente es el más reciente.
  sorteosJurado: {
    select: { confirmado: true, fechaSorteo: true, createdAt: true },
    orderBy: [{ fechaSorteo: 'desc' }, { createdAt: 'desc' }],
    take: 1,
  },
} satisfies Prisma.ConcursoCphSelect

function mapConcurso(c: {
  id: string
  subEstado: string | null
  especialidadSolicitada: string | null
  puestoSolicitado: string | null
  eeConcurso: string | null
  concurso: {
    cargo: { codigo: string | null; literalPuesto: string | null } | null
    hospital: { sigla: string; nombre: string } | null
  } | null
  etiquetas: { etiqueta: { id: string; nombre: string } }[]
  sorteosJurado: { confirmado: boolean }[]
}) {
  // Avance del sorteo: sin sorteo → pendiente; con sorteo borrador → sorteado;
  // sorteo confirmado → confirmado (acta final).
  const ultimo = c.sorteosJurado[0]
  const avanceSorteo: 'pendiente' | 'sorteado' | 'confirmado' = !ultimo
    ? 'pendiente'
    : ultimo.confirmado
      ? 'confirmado'
      : 'sorteado'

  return {
    id: c.id,
    subEstado: c.subEstado,
    cargoCodigo: c.concurso?.cargo?.codigo ?? null,
    literalPuesto: c.puestoSolicitado ?? c.concurso?.cargo?.literalPuesto ?? null,
    especialidadSolicitada: c.especialidadSolicitada,
    eeConcurso: c.eeConcurso,
    hospitalSigla: c.concurso?.hospital?.sigla ?? null,
    hospitalNombre: c.concurso?.hospital?.nombre ?? null,
    etiquetas: c.etiquetas.map((e) => ({ id: e.etiqueta.id, nombre: e.etiqueta.nombre })),
    avanceSorteo,
  }
}

// ─── Candidatos: concursos en B-SORTEO JUR (opcionalmente por etiqueta) ──────
export async function listCandidatosService(query: CandidatosJornadaQuery) {
  const concursos = await prisma.concursoCph.findMany({
    where: {
      subEstado: SUB_ESTADO_SORTEO,
      // Un concurso suspendido no se sortea, aunque su sub-estado sea B-SORTEO JUR.
      suspendido: false,
      ...(query.etiquetaId && { etiquetas: { some: { etiquetaId: query.etiquetaId } } }),
    },
    select: concursoSelect,
    orderBy: { updatedAt: 'desc' },
  })
  return concursos.map(mapConcurso)
}

// ─── Crear jornada ───────────────────────────────────────────────────────────
export async function crearJornadaService(body: CrearJornadaBody, usuarioId?: string) {
  // Validar que todos los concursos elegidos existan y estén en B-SORTEO JUR.
  const concursos = await prisma.concursoCph.findMany({
    where: { id: { in: body.concursoCphIds } },
    select: { id: true, subEstado: true },
  })
  if (concursos.length !== body.concursoCphIds.length) {
    throw AppError.badRequest('Alguno de los concursos elegidos no existe')
  }
  const fueraDeEstado = concursos.filter((c) => c.subEstado !== SUB_ESTADO_SORTEO)
  if (fueraDeEstado.length > 0) {
    throw AppError.conflict(
      `Hay ${fueraDeEstado.length} concurso(s) que no están en estado de sorteo (${SUB_ESTADO_SORTEO})`
    )
  }

  const jornada = await prisma.jornadaSorteo.create({
    data: {
      fecha: new Date(body.fecha),
      titulo: body.titulo ?? null,
      observaciones: body.observaciones ?? null,
      createdById: usuarioId ?? null,
      concursos: { create: body.concursoCphIds.map((concursoCphId) => ({ concursoCphId })) },
    },
    select: { id: true },
  })
  return getJornadaService(jornada.id)
}

// ─── Listar jornadas ─────────────────────────────────────────────────────────
export async function listJornadasService() {
  const jornadas = await prisma.jornadaSorteo.findMany({
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      titulo: true,
      estado: true,
      _count: { select: { concursos: true } },
    },
  })
  return jornadas.map((j) => ({
    id: j.id,
    fecha: j.fecha.toISOString().slice(0, 10),
    titulo: j.titulo,
    estado: j.estado,
    cantidadConcursos: j._count.concursos,
  }))
}

// ─── Detalle de una jornada ──────────────────────────────────────────────────
export async function getJornadaService(id: string) {
  const jornada = await prisma.jornadaSorteo.findUnique({
    where: { id },
    select: {
      id: true,
      fecha: true,
      titulo: true,
      estado: true,
      observaciones: true,
      concursos: { select: { concursoCph: { select: concursoSelect } } },
    },
  })
  if (!jornada) throw AppError.notFound('Jornada no encontrada')
  return {
    id: jornada.id,
    fecha: jornada.fecha.toISOString().slice(0, 10),
    titulo: jornada.titulo,
    estado: jornada.estado,
    observaciones: jornada.observaciones,
    concursos: jornada.concursos.map((jc) => mapConcurso(jc.concursoCph)),
  }
}
