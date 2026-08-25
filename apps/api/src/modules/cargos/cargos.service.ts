import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CargosQuery } from './cargos.schema.js'

// ─── S3-4 + S3-3: listado paginado con filtros ──────────────────────────────
export async function listCargosService(query: CargosQuery) {
  const { page, limit, search, hospitalId, escalafonId, estado } = query

  const where: Prisma.CargoWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(estado && { estado }),
    ...(search && {
      OR: [
        { idSial: { contains: search, mode: 'insensitive' } },
        { literalPuesto: { contains: search, mode: 'insensitive' } },
        { especialidad: { contains: search, mode: 'insensitive' } },
        { agrupador: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [total, cargos] = await Promise.all([
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({
      where,
      include: { hospital: true, escalafon: true },
      orderBy: { idSial: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return { data: cargos, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S3-5: detalle con ocupación actual ─────────────────────────────────────
export async function getCargoByIdService(id: string) {
  const cargo = await prisma.cargo.findUnique({
    where: { id },
    include: {
      hospital: true,
      escalafon: true,
      // Vigente = hasta IS NULL. En teoría hay una sola a la vez por cargo
      // (invariante del flujo de aprobación de padrón), take:1 es solo margen.
      ocupaciones: { where: { hasta: null }, take: 1, include: { persona: true } },
    },
  })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const { ocupaciones, ...rest } = cargo
  return { ...rest, ocupacionActual: ocupaciones[0] ?? null }
}
