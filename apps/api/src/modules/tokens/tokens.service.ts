import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { ListTokensQuery } from './tokens.schema.js'

const TOKEN_SELECT = {
  id: true,
  usuarioId: true,
  usuario: { select: { username: true } },
  familyId: true,
  expiresAt: true,
  revocado: true,
  createdAt: true,
} as const

type TokenRow = {
  id: string
  usuarioId: string
  usuario: { username: string }
  familyId: string
  expiresAt: Date
  revocado: boolean
  createdAt: Date
}

// Aplana `usuario: { username }` → `username`, mismo criterio que
// toUsuarioDto() en usuarios.service.ts.
function toTokenDto(row: TokenRow) {
  const { usuario, ...rest } = row
  return { ...rest, username: usuario.username }
}

export async function listTokensService(query: ListTokensQuery) {
  const { page, limit, username, activo } = query
  const skip = (page - 1) * limit

  const where: Prisma.RefreshTokenWhereInput = {
    ...(username && { usuario: { username: { contains: username, mode: 'insensitive' } } }),
    ...(activo !== undefined && { revocado: !activo }),
  }

  const [rows, total] = await Promise.all([
    prisma.refreshToken.findMany({
      where,
      select: TOKEN_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.refreshToken.count({ where }),
  ])

  return { data: rows.map(toTokenDto), meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

export async function revokeTokenService(id: string) {
  const token = await prisma.refreshToken.findUnique({ where: { id } })
  if (!token) throw AppError.notFound('Token no encontrado')

  const row = await prisma.refreshToken.update({
    where: { id },
    data: { revocado: true },
    select: TOKEN_SELECT,
  })
  return toTokenDto(row)
}

// Revoca TODAS las familias de tokens del usuario (no solo la del token que
// disparó la acción) — a diferencia de logout() en auth.service.ts, que solo
// revoca la familia del token que se está cerrando.
export async function revokeAllForUserService(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } })
  if (!usuario) throw AppError.notFound('Usuario no encontrado')

  const { count } = await prisma.refreshToken.updateMany({
    where: { usuarioId, revocado: false },
    data: { revocado: true },
  })
  return { revocados: count }
}
