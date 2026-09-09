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
  baja: { model: 'etiquetaBaja' as const, fk: 'bajaId' },
  solicitud_alta: { model: 'etiquetaSolicitudAlta' as const, fk: 'solicitudAltaId' },
} as const

export async function asignarEtiquetaService(etiquetaId: string, body: AsignarEtiquetaBody) {
  const { entidad, entidadId } = body
  const { model, fk } = TABLE_MAP[entidad]
  // upsert: si ya existe no falla
  await (prisma[model] as any).upsert({
    where: { [`etiquetaId_${fk}`]: { etiquetaId, [fk]: entidadId } },
    create: { etiquetaId, [fk]: entidadId },
    update: {},
  })
}

export async function desasignarEtiquetaService(etiquetaId: string, body: AsignarEtiquetaBody) {
  const { entidad, entidadId } = body
  const { model, fk } = TABLE_MAP[entidad]
  await (prisma[model] as any).deleteMany({
    where: { etiquetaId, [fk]: entidadId },
  })
}
