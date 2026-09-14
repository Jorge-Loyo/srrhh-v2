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
  ip: true,
  createdAt: true,
} as const

type TokenRow = {
  id: string
  usuarioId: string
  usuario: { username: string }
  familyId: string
  expiresAt: Date
  revocado: boolean
  ip: string | null
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

  // "Activo" = sesión realmente utilizable ahora mismo: no alcanza con
  // `revocado: false` — un token puede no estar marcado revocado y sin
  // embargo ya haber vencido (la expiración se revisa recién al usarlo en
  // refreshTokenService, no se marca `revocado` proactivamente al pasar la
  // fecha). Sin el chequeo de `expiresAt`, "Sesiones activas" mostraba
  // sesiones fantasma que en realidad ya no servían para nada — encontrado
  // rediseñando la pantalla de Tokens 2026-09-14.
  //
  // Nota sobre por qué esto ya alcanza para representar "una sesión por
  // fila" sin agrupar por familyId: por la rotación en refreshTokenService,
  // en todo momento una familia tiene A LO SUMO una fila no revocada y
  // vigente (la más nueva) — las anteriores quedan `revocado: true` al
  // rotar. Este filtro entonces ya da, 1 a 1, la lista de sesiones vivas.
  const where: Prisma.RefreshTokenWhereInput = {
    ...(username && { usuario: { username: { contains: username, mode: 'insensitive' } } }),
    ...(activo === true && { revocado: false, expiresAt: { gt: new Date() } }),
    ...(activo === false && { OR: [{ revocado: true }, { expiresAt: { lte: new Date() } }] }),
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

// Cierra la SESIÓN completa (toda la familia de rotación), no solo esta fila
// puntual — la fila que ve la pantalla es la última de la familia (por
// rotación en refreshTokenService nunca hay más de una viva a la vez), pero
// "cerrar esta sesión" tiene que significar eso: la sesión, no un token
// interno que el usuario ni sabe que existe. Mismo criterio que logout() en
// auth.service.ts (revoca por familyId), pero disparado por un admin sobre
// la sesión de cualquier usuario, no por el dueño de la sesión.
export async function revokeTokenService(id: string) {
  const token = await prisma.refreshToken.findUnique({ where: { id } })
  if (!token) throw AppError.notFound('Sesión no encontrada')

  const { count } = await prisma.refreshToken.updateMany({
    where: { familyId: token.familyId, revocado: false },
    data: { revocado: true },
  })
  return { ok: true, cerradas: count }
}

// Revoca TODAS las sesiones (familias) del usuario, no solo una — para
// cuando se sospecha una cuenta comprometida y hay que cerrar todo de una.
export async function revokeAllForUserService(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } })
  if (!usuario) throw AppError.notFound('Usuario no encontrado')

  const { count } = await prisma.refreshToken.updateMany({
    where: { usuarioId, revocado: false },
    data: { revocado: true },
  })
  return { revocados: count }
}
