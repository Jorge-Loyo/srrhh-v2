import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type {
  PostulantesQuery,
  CreatePostulanteBody,
  UpdatePostulanteBody,
  CreatePostulacionBody,
  UpdatePostulacionBody,
} from './postulantes.schema.js'

const includePostulante = {
  persona: { select: { id: true, cuil: true, apellidoNombre: true, especialidadPrincipal: true } },
}

// ─── Postulantes ─────────────────────────────────────────────────────────────

export async function listPostulantesService(query: PostulantesQuery) {
  const { search, esExterno, especialidad } = query
  return prisma.postulante.findMany({
    where: {
      ...(esExterno !== undefined && { esExterno }),
      ...(especialidad && { especialidad: { contains: especialidad, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { cuil: { contains: search } },
          { apellidoNombre: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    include: includePostulante,
    orderBy: { apellidoNombre: 'asc' },
  })
}

export async function getPostulanteService(id: string) {
  const postulante = await prisma.postulante.findUnique({
    where: { id },
    include: {
      ...includePostulante,
      postulaciones: {
        include: {
          concursoCph: {
            select: {
              id: true,
              especialidadSolicitada: true,
              estado: true,
              concurso: { select: { cargo: { select: { codigo: true } } } },
            },
          },
        },
        orderBy: { fechaPostulacion: 'desc' },
      },
    },
  })
  if (!postulante) throw AppError.notFound('Postulante no encontrado')
  return postulante
}

export async function createPostulanteService(body: CreatePostulanteBody) {
  const existe = await prisma.postulante.findUnique({ where: { cuil: body.cuil } })
  if (existe) throw AppError.conflict('Ya existe un postulante con ese CUIL')

  // Vincular a Persona si el CUIL existe en el padrón
  const persona = await prisma.persona.findUnique({ where: { cuil: body.cuil } })

  return prisma.postulante.create({
    data: {
      cuil: body.cuil,
      apellidoNombre: body.apellidoNombre,
      esExterno: body.esExterno,
      ...(body.especialidad && { especialidad: body.especialidad }),
      ...(persona && { personaId: persona.id }),
    },
    include: includePostulante,
  })
}

export async function updatePostulanteService(id: string, body: UpdatePostulanteBody) {
  const postulante = await prisma.postulante.findUnique({ where: { id } })
  if (!postulante) throw AppError.notFound('Postulante no encontrado')

  return prisma.postulante.update({
    where: { id },
    data: {
      ...(body.apellidoNombre !== undefined && { apellidoNombre: body.apellidoNombre }),
      ...(body.especialidad !== undefined && { especialidad: body.especialidad }),
      ...(body.esExterno !== undefined && { esExterno: body.esExterno }),
    },
    include: includePostulante,
  })
}

// ─── Postulaciones ───────────────────────────────────────────────────────────

export async function listPostulacionesService(postulanteId: string) {
  const postulante = await prisma.postulante.findUnique({ where: { id: postulanteId } })
  if (!postulante) throw AppError.notFound('Postulante no encontrado')

  return prisma.postulanteConcurso.findMany({
    where: { postulanteId },
    include: {
      concursoCph: {
        select: {
          id: true,
          especialidadSolicitada: true,
          estado: true,
          hospital: { select: { sigla: true, nombre: true } },
          concurso: { select: { cargo: { select: { codigo: true, literalPuesto: true } } } },
        },
      },
    },
    orderBy: { fechaPostulacion: 'desc' },
  })
}

export async function createPostulacionService(postulanteId: string, body: CreatePostulacionBody) {
  const [postulante, concurso] = await Promise.all([
    prisma.postulante.findUnique({ where: { id: postulanteId } }),
    prisma.concursoCph.findUnique({ where: { id: body.concursoCphId } }),
  ])
  if (!postulante) throw AppError.notFound('Postulante no encontrado')
  if (!concurso) throw AppError.notFound('Concurso CPH no encontrado')

  const existe = await prisma.postulanteConcurso.findUnique({
    where: { postulanteId_concursoCphId: { postulanteId, concursoCphId: body.concursoCphId } },
  })
  if (existe) throw AppError.conflict('El postulante ya está inscripto en este concurso')

  return prisma.postulanteConcurso.create({
    data: {
      postulanteId,
      concursoCphId: body.concursoCphId,
      fechaPostulacion: new Date(body.fechaPostulacion),
      ...(body.observaciones && { observaciones: body.observaciones }),
    },
  })
}

export async function updatePostulacionService(
  postulanteId: string,
  postulacionId: string,
  body: UpdatePostulacionBody
) {
  const postulacion = await prisma.postulanteConcurso.findFirst({
    where: { id: postulacionId, postulanteId },
  })
  if (!postulacion) throw AppError.notFound('Postulación no encontrada')

  return prisma.postulanteConcurso.update({
    where: { id: postulacionId },
    data: {
      ...(body.estado && { estado: body.estado }),
      ...(body.observaciones !== undefined && { observaciones: body.observaciones }),
    },
  })
}

// ─── Búsqueda por CUIL (para vincular desde otros módulos) ───────────────────

export async function getPostulanteByCuilService(cuil: string) {
  const postulante = await prisma.postulante.findUnique({
    where: { cuil },
    include: includePostulante,
  })
  if (!postulante) throw AppError.notFound('Postulante no encontrado')
  return postulante
}
