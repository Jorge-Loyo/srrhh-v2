import { prisma } from '../../shared/prisma.js'
import { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors/AppError.js'
import { esConduccionPorPrefijo, esConduccionPorLiteral } from '../../shared/codigoCargo.js'
import type {
  CrearJornadaBody,
  CandidatosJornadaQuery,
  EstadoJornada,
} from './jornadas-sorteo.schema.js'

// Sub-estado en el que un concurso está listo para sortear jurado (Etapa 2).
const SUB_ESTADO_SORTEO = 'B-SORTEO JUR'

function normStr(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase()
}

// Deriva la categoría del cargo a partir de código/escalafón/unificador, para
// poder agrupar los concursos en la jornada:
//   tipoCargo:   'conduccion' | 'ejecucion'
//   modalidad:   'pou' | 'pof'  (guardia vs planta)
//   esMedico:    escalafón médico / CPH (vs no médico: enfermería, técnicos, EG…)
function derivarCategoria(params: {
  codigo: string | null
  literalPuesto: string | null
  escalafon: string | null
  unificadorPuesto: string | null
}): { tipoCargo: 'conduccion' | 'ejecucion'; modalidad: 'pou' | 'pof'; esMedico: boolean } {
  const esConduccion =
    esConduccionPorPrefijo(params.codigo) || esConduccionPorLiteral(params.literalPuesto)
  const cod = normStr(params.codigo)
  const unif = normStr(params.unificadorPuesto)
  const modalidad: 'pou' | 'pof' =
    cod.includes('POU') || unif.includes('POU') || unif.includes('GUARDIA') ? 'pou' : 'pof'
  const esc = normStr(params.escalafon)
  const esMedico =
    esc.includes('MEDICO') ||
    esc.includes('MÉDICO') ||
    esc === 'CPH' ||
    esc.includes('CARRERA PROFESIONAL HOSPITALARIA') ||
    cod.startsWith('CPH')
  return { tipoCargo: esConduccion ? 'conduccion' : 'ejecucion', modalidad, esMedico }
}

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
      cargo: {
        select: {
          codigo: true,
          literalPuesto: true,
          unificadorPuesto: true,
          escalafon: { select: { nombre: true } },
        },
      },
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
    cargo: {
      codigo: string | null
      literalPuesto: string | null
      unificadorPuesto: string | null
      escalafon: { nombre: string } | null
    } | null
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

  const cat = derivarCategoria({
    codigo: c.concurso?.cargo?.codigo ?? null,
    literalPuesto: c.puestoSolicitado ?? c.concurso?.cargo?.literalPuesto ?? null,
    escalafon: c.concurso?.cargo?.escalafon?.nombre ?? null,
    unificadorPuesto: c.concurso?.cargo?.unificadorPuesto ?? null,
  })

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
    // Campos derivados para agrupar/filtrar en la vista de jornada.
    tipoCargo: cat.tipoCargo,
    modalidad: cat.modalidad,
    esMedico: cat.esMedico,
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

// ─── Cambiar estado de una jornada (cerrar / reabrir) ────────────────────────
// Cerrar (estado 'finalizada') marca la jornada como culminada: ya no se
// sortea más ahí. IMPORTANTE: cerrar NO toca el sub-estado de los concursos.
// Los concursos que no se sortearon siguen en 'B-SORTEO JUR' y por lo tanto
// siguen apareciendo como candidatos para otra jornada (ver listCandidatos:
// la elegibilidad depende solo del sub-estado del concurso, no de la jornada).
export async function cambiarEstadoJornadaService(id: string, estado: EstadoJornada) {
  const jornada = await prisma.jornadaSorteo.findUnique({
    where: { id },
    select: { id: true, estado: true },
  })
  if (!jornada) throw AppError.notFound('Jornada no encontrada')
  if (jornada.estado === estado) {
    throw AppError.conflict(
      estado === 'finalizada' ? 'La jornada ya está cerrada' : 'La jornada ya está abierta',
    )
  }
  await prisma.jornadaSorteo.update({ where: { id }, data: { estado } })
  return getJornadaService(id)
}
