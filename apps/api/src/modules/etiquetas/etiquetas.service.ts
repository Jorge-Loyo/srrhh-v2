import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { EtiquetasQuery, CreateEtiquetaBody, UpdateEtiquetaBody, AsignarEtiquetaBody } from './etiquetas.schema.js'

export async function listEtiquetasService(query: EtiquetasQuery) {
  const { search, activo } = query
  return prisma.etiqueta.findMany({
    where: {
      ...(search && { nombre: { contains: search, mode: 'insensitive' } }),
      ...(activo !== undefined && { activo }),
    },
    orderBy: { nombre: 'asc' },
  })
}

export async function createEtiquetaService(body: CreateEtiquetaBody) {
  const existe = await prisma.etiqueta.findUnique({ where: { nombre: body.nombre } })
  if (existe) throw AppError.conflict('Ya existe una etiqueta con ese nombre')
  return prisma.etiqueta.create({
    data: { nombre: body.nombre, ...(body.color && { color: body.color }) },
  })
}

export async function updateEtiquetaService(id: string, body: UpdateEtiquetaBody) {
  if (body.nombre) {
    const existe = await prisma.etiqueta.findFirst({
      where: { nombre: body.nombre, NOT: { id } },
    })
    if (existe) throw AppError.conflict('Ya existe una etiqueta con ese nombre')
  }
  return prisma.etiqueta.update({
    where: { id },
    data: {
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.activo !== undefined && { activo: body.activo }),
    },
  })
}

export async function deleteEtiquetaService(id: string) {
  return prisma.etiqueta.update({ where: { id }, data: { activo: false } })
}

// ── Asignar / desasignar ──────────────────────────────────────────────────────

const TABLE_MAP = {
  cargo: { model: 'etiquetaCargo' as const, fk: 'cargoId' },
  concurso_cph: { model: 'etiquetaConcursoCph' as const, fk: 'concursoCphId' },
  concurso_ceetps: { model: 'etiquetaConcursoCeetps' as const, fk: 'concursoCeetpsId' },
  baja: { model: 'etiquetaBaja' as const, fk: 'bajaId' },
  solicitud_alta: { model: 'etiquetaSolicitudAlta' as const, fk: 'solicitudAltaId' },
} as const

export async function asignarEtiquetaService(etiquetaId: string, body: AsignarEtiquetaBody) {
  const { entidad, entidadId } = body
  const { model, fk } = TABLE_MAP[entidad]
  await (prisma[model] as any).upsert({
    where: { [`etiquetaId_${fk}`]: { etiquetaId, [fk]: entidadId } },
    create: { etiquetaId, [fk]: entidadId },
    update: {},
  })

  // Propagar siempre al cargo relacionado.
  const cargoId = await resolverCargoId(entidad, entidadId, etiquetaId)
  if (cargoId) {
    await prisma.etiquetaCargo.upsert({
      where: { etiquetaId_cargoId: { etiquetaId, cargoId } },
      create: { etiquetaId, cargoId },
      update: {},
    })
  }
}

export async function desasignarEtiquetaService(etiquetaId: string, body: AsignarEtiquetaBody) {
  const { entidad, entidadId } = body
  const { model, fk } = TABLE_MAP[entidad]
  await (prisma[model] as any).deleteMany({
    where: { etiquetaId, [fk]: entidadId },
  })
  // No se quita del cargo: la etiqueta le pertenece al cargo independientemente.
}

/** Resuelve el cargoId a partir de la entidad que recibe la etiqueta. */
async function resolverCargoId(entidad: AsignarEtiquetaBody['entidad'], entidadId: string, etiquetaId: string): Promise<string | null> {
  if (entidad === 'cargo') return entidadId
  if (entidad === 'baja') {
    const baja = await prisma.baja.findUnique({ where: { id: entidadId }, select: { cargoId: true } })
    return baja?.cargoId ?? null
  }
  if (entidad === 'concurso_cph') {
    const cph = await prisma.concursoCph.findUnique({ where: { id: entidadId }, select: { concurso: { select: { cargoId: true } } } })
    return cph?.concurso.cargoId ?? null
  }
  if (entidad === 'concurso_ceetps') {
    const ceetps = await prisma.concursoCeetps.findUnique({ where: { id: entidadId }, select: { cargoId: true } })
    return ceetps?.cargoId ?? null
  }
  if (entidad === 'solicitud_alta') {
    // La solicitud puede tener N cargos creados; propagar a todos.
    const s = await prisma.solicitudAlta.findUnique({ where: { id: entidadId }, select: { cargosCreadosIds: true } })
    if (!s || s.cargosCreadosIds.length === 0) return null
    // Propagar a todos los cargos del lote (createMany con skipDuplicates).
    await prisma.etiquetaCargo.createMany({
      data: s.cargosCreadosIds.map((cargoId) => ({ etiquetaId, cargoId })),
      skipDuplicates: true,
    })
    return null // ya propagado arriba
  }
  return null
}
