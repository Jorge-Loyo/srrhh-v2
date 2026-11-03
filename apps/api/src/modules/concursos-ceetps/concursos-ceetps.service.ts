import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { ConcursosCeetpsQuery, PatchConcursoCeetpsBody, DesignarCeetpsBody } from './concursos-ceetps.schema.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { calcEstadoCeetps } from './concursosCeetps.calc.js'

const include = {
  // cargo.codigoRegistro: clasificador FINO de la carrera —
  // Enfermería(87)/Técnicos(85)/Administrativa(83). Las tres carreras tienen
  // escalafones DISTINTOS en el modelo normalizado actual (seed/QB:
  // 87 Nueva Carrera Enfermería, 85 CEETPS, 83 Nueva Carrera Administrativa),
  // así que el filtro por `escalafonId` ya las separa; `codigoRegistro` sigue
  // siendo el clasificador fino que usan los documentos exportables
  // (Validación/Autorización). (El comentario anterior decía que las tres
  // compartían un único escalafón "CEETPS" — eso describía un modelo viejo
  // pre-reset S21 y quedó desactualizado.)
  concurso: { include: { cargo: { include: { codigoRegistro: true } }, persona: true, baja: true } },
  hospital: true,
  escalafon: true,
  personaDesignada: true,
} satisfies Prisma.ConcursoCeetpsInclude

// `calcEstadoCeetps` se extrajo a ./concursosCeetps.calc.ts (módulo exportable,
// reutilizado por el script de carga masiva) — misma lógica, sin cambio de
// comportamiento.

const CAMPOS_FECHA = new Set<keyof PatchConcursoCeetpsBody>(['fechaIfacs', 'fechaInsal'])

// ─── S5-1: listado paginado con filtros ─────────────────────────────────────
export async function listConcursosCeetpsService(query: ConcursosCeetpsQuery) {
  const { page, limit, hospitalId, escalafonId, estado, search } = query
  const offset = (page - 1) * limit

  const where: Prisma.ConcursoCeetpsWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(estado && { estado }),
    ...(search && {
      OR: [
        { expedienteConcurso: { contains: search, mode: 'insensitive' } },
        { puestoSolicitado: { contains: search, mode: 'insensitive' } },
        { resolucionDesignacion: { contains: search, mode: 'insensitive' } },
        { observaciones: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [total, data] = await Promise.all([
    prisma.concursoCeetps.count({ where }),
    prisma.concursoCeetps.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S5-1: detalle completo ──────────────────────────────────────────────────
export async function getConcursoCeetpsByIdService(id: string) {
  const concursoCeetps = await prisma.concursoCeetps.findUnique({ where: { id }, include })
  if (!concursoCeetps) throw AppError.notFound('Concurso CEETPS no encontrado')
  return concursoCeetps
}

// ─── S5-1: actualizar campos por fase — estado se recalcula ─────────────────
export async function patchConcursoCeetpsService(id: string, body: PatchConcursoCeetpsBody) {
  const existing = await prisma.concursoCeetps.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Concurso CEETPS no encontrado')

  if (existing.estado === 'finalizado' || existing.estado === 'desierto') {
    throw AppError.conflict(`No se puede modificar un concurso ${existing.estado}`)
  }

  const patch: Prisma.ConcursoCeetpsUpdateInput = {}
  for (const [key, value] of Object.entries(body) as [keyof PatchConcursoCeetpsBody, unknown][]) {
    if (value === undefined) continue
    const isFecha = CAMPOS_FECHA.has(key)
    ;(patch as Record<string, unknown>)[key] = isFecha && typeof value === 'string' ? new Date(value) : value
  }

  // S20-10: puestoSolicitado (auditoría) se recalcula del catálogo cuando se
  // manda puestoCargoSolicitadoId — el combobox ya no manda el string a mano.
  if ('puestoCargoSolicitadoId' in body) {
    const puestoCargoSolicitadoId = body.puestoCargoSolicitadoId
    if (puestoCargoSolicitadoId) {
      const puesto = await prisma.puestoCargo.findUnique({ where: { id: puestoCargoSolicitadoId } })
      if (!puesto) throw AppError.notFound('Puesto no encontrado en el catálogo')
      patch.puestoSolicitado = puesto.nombre
    } else {
      patch.puestoSolicitado = null
    }
  }

  const merged = { ...existing, ...(patch as Partial<typeof existing>) }
  const estado = calcEstadoCeetps(merged)

  return prisma.concursoCeetps.update({
    where: { id },
    data: { ...patch, estado },
    include,
  })
}

// ─── S16-2: registrar designación — crea Ocupacion, avanza estado a finalizado ──
export async function designarConcursoCeetpsService(id: string, body: DesignarCeetpsBody) {
  const concurso = await prisma.concursoCeetps.findUnique({
    where: { id },
    include: { concurso: { include: { cargo: true } } },
  })
  if (!concurso) throw AppError.notFound('Concurso CEETPS no encontrado')
  if (concurso.estado === 'finalizado') throw AppError.conflict('El concurso ya está finalizado')
  if (concurso.estado === 'desierto')   throw AppError.conflict('El concurso está desierto')

  const persona = await prisma.persona.findUnique({ where: { id: body.personaId } })
  if (!persona) throw AppError.notFound('Persona no encontrada')

  const cargoId = concurso.cargoId

  const ocupActiva = await prisma.ocupacion.findFirst({ where: { cargoId, hasta: null } })
  if (ocupActiva) throw AppError.conflict('El cargo ya tiene una ocupación activa')

  const idSialRol = body.idSialRol ?? `MANUAL-${cargoId.slice(0, 8)}-${body.fechaDesde}`

  return prisma.$transaction(async (tx) => {
    await tx.ocupacion.create({
      data: {
        personaId: body.personaId,
        cargoId,
        idSialRol,
        desde: new Date(body.fechaDesde),
        hasta: null,
      },
    })

    await tx.cargo.update({
      where: { id: cargoId },
      data: { estado: 'vigente', estadoDesde: new Date(body.fechaDesde) },
    })

    const updated = await tx.concursoCeetps.update({
      where: { id },
      data: {
        personaDesignadaId: body.personaId,
        estado: 'finalizado',
      },
      include,
    })

    const cargoCodigo = (concurso.concurso as unknown as { cargo?: { codigo?: string } })?.cargo?.codigo ?? id.slice(0, 8)
    await crearNotificacion({
      tipo:      'autorizacion_resuelta',
      rolSlug:   'concursales_ceetps',
      titulo:    `Designación registrada — ${cargoCodigo}`,
      mensaje:   `${persona.apellidoNombre} fue designado/a en el cargo ${cargoCodigo}.`,
      origenTipo: 'concurso_ceetps',
      origenId:   id,
      origenKey:  `designacion_ceetps:${id}`,
    })

    return updated
  })
}
