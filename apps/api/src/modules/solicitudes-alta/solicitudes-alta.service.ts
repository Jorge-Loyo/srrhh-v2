import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { crearAutorizacion } from '../autorizaciones/autorizaciones.service.js'
import type { CreateSolicitudAltaBody, SolicitudesAltaQuery } from './solicitudes-alta.schema.js'

const include = {
  hospital:       { select: { id: true, sigla: true, nombre: true } },
  escalafon:      { select: { id: true, nombre: true } },
  codigoRegistro: { select: { id: true, literal: true } },
  solicitadoPor:  { select: { id: true, username: true, email: true } },
} as const

// --- POST / --- crear solicitud + autorizacion pendiente --------------------
export async function createSolicitudAltaService(
  body: CreateSolicitudAltaBody,
  solicitadoPorId: string,
) {
  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  const escalafon = await prisma.escalafon.findUnique({ where: { id: body.escalafonId } })
  if (!escalafon) throw AppError.notFound('Escalafon no encontrado')

  if (body.codigoRegistroId) {
    const cr = await prisma.codigoRegistro.findUnique({ where: { id: body.codigoRegistroId } })
    if (!cr) throw AppError.notFound('Codigo de registro no encontrado')
  }

  return prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitudAlta.create({
      data: {
        hospitalId:       body.hospitalId,
        escalafonId:      body.escalafonId,
        codigoRegistroId: body.codigoRegistroId ?? null,
        literalPuesto:    body.literalPuesto,
        especialidad:     body.especialidad ?? null,
        agrupador:        body.agrupador ?? null,
        unificadorPuesto: body.unificadorPuesto ?? null,
        regimen:          body.regimen ?? null,
        expediente:       body.expediente ?? null,
        desde:            body.desde ? new Date(body.desde) : null,
        cantidad:         body.cantidad,
        solicitadoPorId,
      },
      include,
    })

    await crearAutorizacion(tx as typeof prisma, {
      tipo:               'alta_cargo',
      referenciaId:       solicitud.id,
      referenciaTipo:     'solicitud_alta',
      solicitadoPorId,
      resolverPorRolSlug: 'director',
    })

    return solicitud
  })
}

// --- GET / --- listado paginado ---------------------------------------------
export async function listSolicitudesAltaService(query: SolicitudesAltaQuery) {
  const { page, limit, hospitalId, estado } = query
  const offset = (page - 1) * limit

  const where = {
    ...(hospitalId && { hospitalId }),
    ...(estado     && { estado }),
  }

  const [total, data] = await Promise.all([
    prisma.solicitudAlta.count({ where }),
    prisma.solicitudAlta.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip:    offset,
      take:    limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// --- GET /:id --- detalle ---------------------------------------------------
export async function getSolicitudAltaService(id: string) {
  const solicitud = await prisma.solicitudAlta.findUnique({ where: { id }, include })
  if (!solicitud) throw AppError.notFound('Solicitud de alta no encontrada')
  return solicitud
}
