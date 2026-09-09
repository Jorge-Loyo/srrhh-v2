import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type {
  OrdenesMeritoQuery,
  CreateOrdenMeritoBody,
  UpdateOrdenMeritoBody,
  CreateIntegranteBody,
  UpdateIntegranteBody,
  AlertaQuery,
} from './ordenes-merito.schema.js'

const VIGENCIA_MESES = 6
const PRORROGA_DIAS = 60

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const includeIntegrantes = {
  integrantes: { orderBy: { posicion: 'asc' as const } },
}

// ─── Listado ─────────────────────────────────────────────────────────────────

export async function listOrdenesMeritoService(query: OrdenesMeritoQuery) {
  const { concursoCphId, especialidad, estado } = query
  return prisma.ordenMerito.findMany({
    where: {
      ...(concursoCphId && { concursoCphId }),
      ...(especialidad && { especialidad: { contains: especialidad, mode: 'insensitive' } }),
      ...(estado && { estado }),
    },
    include: includeIntegrantes,
    orderBy: { fechaPublicacion: 'desc' },
  })
}

// ─── Crear ───────────────────────────────────────────────────────────────────

export async function createOrdenMeritoService(body: CreateOrdenMeritoBody) {
  const concurso = await prisma.concursoCph.findUnique({ where: { id: body.concursoCphId } })
  if (!concurso) throw AppError.notFound('Concurso CPH no encontrado')

  const fechaPublicacion = new Date(body.fechaPublicacion)
  const fechaVencimiento = addMonths(fechaPublicacion, VIGENCIA_MESES)

  return prisma.ordenMerito.create({
    data: {
      concursoCphId: body.concursoCphId,
      especialidad: body.especialidad,
      ...(body.puesto && { puesto: body.puesto }),
      ...(body.expediente && { expediente: body.expediente }),
      fechaPublicacion,
      fechaVencimiento,
      ...(body.observaciones && { observaciones: body.observaciones }),
    },
    include: includeIntegrantes,
  })
}

// ─── Actualizar ──────────────────────────────────────────────────────────────

export async function updateOrdenMeritoService(id: string, body: UpdateOrdenMeritoBody) {
  const existing = await prisma.ordenMerito.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Orden de mérito no encontrada')

  // Si se agrega prórroga, calcularla desde fechaVencimiento + 60 días
  // a menos que se pase una fecha explícita
  let fechaProrroga: Date | null | undefined = undefined
  if (body.fechaProrroga !== undefined) {
    fechaProrroga = body.fechaProrroga ? new Date(body.fechaProrroga) : null
  } else if (body.estado === 'prorrogada' && !existing.fechaProrroga) {
    fechaProrroga = addDays(existing.fechaVencimiento, PRORROGA_DIAS)
  }

  return prisma.ordenMerito.update({
    where: { id },
    data: {
      ...(body.expediente !== undefined && { expediente: body.expediente }),
      ...(body.observaciones !== undefined && { observaciones: body.observaciones }),
      ...(fechaProrroga !== undefined && { fechaProrroga }),
      ...(body.estado && { estado: body.estado }),
    },
    include: includeIntegrantes,
  })
}

// ─── Integrantes ─────────────────────────────────────────────────────────────

export async function listIntegrantesService(ordenMeritoId: string) {
  const om = await prisma.ordenMerito.findUnique({ where: { id: ordenMeritoId } })
  if (!om) throw AppError.notFound('Orden de mérito no encontrada')
  return prisma.ordenMeritoIntegrante.findMany({
    where: { ordenMeritoId },
    include: { persona: { select: { id: true, cuil: true, apellidoNombre: true } } },
    orderBy: { posicion: 'asc' },
  })
}

export async function createIntegranteService(ordenMeritoId: string, body: CreateIntegranteBody) {
  const om = await prisma.ordenMerito.findUnique({ where: { id: ordenMeritoId } })
  if (!om) throw AppError.notFound('Orden de mérito no encontrada')

  // Vincular a Persona si el CUIL existe en el padrón
  const persona = await prisma.persona.findUnique({ where: { cuil: body.cuil } })

  return prisma.ordenMeritoIntegrante.create({
    data: {
      ordenMeritoId,
      cuil: body.cuil,
      apellidoNombre: body.apellidoNombre,
      posicion: body.posicion,
      ...(body.especialidad && { especialidad: body.especialidad }),
      ...(persona && { personaId: persona.id }),
    },
    include: { persona: { select: { id: true, cuil: true, apellidoNombre: true } } },
  })
}

export async function updateIntegranteService(
  ordenMeritoId: string,
  integranteId: string,
  body: UpdateIntegranteBody
) {
  const integrante = await prisma.ordenMeritoIntegrante.findFirst({
    where: { id: integranteId, ordenMeritoId },
  })
  if (!integrante) throw AppError.notFound('Integrante no encontrado')

  return prisma.ordenMeritoIntegrante.update({
    where: { id: integranteId },
    data: {
      ...(body.designado !== undefined && { designado: body.designado }),
      ...(body.concursoCphDesignadoId !== undefined && {
        concursoCphDesignadoId: body.concursoCphDesignadoId,
      }),
    },
    include: { persona: { select: { id: true, cuil: true, apellidoNombre: true } } },
  })
}

export async function deleteIntegranteService(ordenMeritoId: string, integranteId: string) {
  const integrante = await prisma.ordenMeritoIntegrante.findFirst({
    where: { id: integranteId, ordenMeritoId },
  })
  if (!integrante) throw AppError.notFound('Integrante no encontrado')
  await prisma.ordenMeritoIntegrante.delete({ where: { id: integranteId } })
}

// ─── Alerta: OM vigentes para una especialidad ───────────────────────────────

export async function alertaOrdenesMeritoService(query: AlertaQuery) {
  const hoy = new Date()
  return prisma.ordenMerito.findMany({
    where: {
      especialidad: { contains: query.especialidad, mode: 'insensitive' },
      estado: { in: ['vigente', 'prorrogada'] },
      // Vigente si no venció (o tiene prórroga activa)
      OR: [
        { fechaProrroga: null, fechaVencimiento: { gte: hoy } },
        { fechaProrroga: { gte: hoy } },
      ],
    },
    include: {
      concursoCph: {
        select: {
          id: true,
          especialidadSolicitada: true,
          concurso: { select: { cargo: { select: { codigo: true } } } },
        },
      },
      integrantes: { orderBy: { posicion: 'asc' as const } },
    },
    orderBy: { fechaPublicacion: 'desc' },
  })
}
