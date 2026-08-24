import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import type { LoginBody, RefreshBody } from './auth.schema.js'

// ─── helpers ────────────────────────────────────────────────────────────────

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function refreshExpiresAt() {
  // JWT_REFRESH_EXPIRES es "7d", "30d", etc.
  const match = env.JWT_REFRESH_EXPIRES.match(/^(\d+)([dhm])$/)
  if (!match) throw new Error('JWT_REFRESH_EXPIRES inválido')
  const value = parseInt(match[1]!)
  const unit = match[2]!
  const ms = unit === 'd' ? value * 86400000 : unit === 'h' ? value * 3600000 : value * 60000
  return new Date(Date.now() + ms)
}

async function createRefreshToken(usuarioId: string, familyId: string, signToken: (p: object) => string) {
  const raw = crypto.randomBytes(40).toString('hex')
  await prisma.refreshToken.create({
    data: {
      usuarioId,
      tokenHash: hashToken(raw),
      familyId,
      expiresAt: refreshExpiresAt(),
    },
  })
  return raw
}

function buildUserPayload(usuario: { id: string; username: string; rol: string; hospitalId: string | null }) {
  return { id: usuario.id, username: usuario.username, rol: usuario.rol, hospitalId: usuario.hospitalId }
}

// ─── login ───────────────────────────────────────────────────────────────────

export async function loginService(body: LoginBody, signToken: (payload: object) => string) {
  const usuario = await prisma.usuario.findUnique({ where: { username: body.username } })

  if (!usuario || !usuario.activo) throw AppError.unauthorized('Credenciales inválidas')

  const valid = await bcrypt.compare(body.password, usuario.passwordHash)
  if (!valid) throw AppError.unauthorized('Credenciales inválidas')

  const familyId = crypto.randomUUID()
  const accessToken = signToken(buildUserPayload(usuario))
  const refreshToken = await createRefreshToken(usuario.id, familyId, signToken)

  return {
    accessToken,
    refreshToken,
    user: {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      rol: usuario.rol,
      hospitalId: usuario.hospitalId,
    },
  }
}

// ─── refresh ─────────────────────────────────────────────────────────────────

export async function refreshTokenService(body: RefreshBody, signToken: (payload: object) => string) {
  const tokenHash = hashToken(body.refreshToken)

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })

  if (!stored) throw AppError.unauthorized('Refresh token inválido')

  // Detección de reutilización: si ya fue revocado, revocar toda la familia
  if (stored.revocado) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId },
      data: { revocado: true },
    })
    throw AppError.unauthorized('Refresh token reutilizado — sesión revocada')
  }

  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revocado: true } })
    throw AppError.unauthorized('Refresh token expirado')
  }

  // Revocar el token usado
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revocado: true } })

  const usuario = await prisma.usuario.findUnique({ where: { id: stored.usuarioId } })
  if (!usuario || !usuario.activo) throw AppError.unauthorized('Usuario inactivo')

  const accessToken = signToken(buildUserPayload(usuario))
  const newRefreshToken = await createRefreshToken(usuario.id, stored.familyId, signToken)

  return { accessToken, refreshToken: newRefreshToken }
}

// ─── logout ──────────────────────────────────────────────────────────────────

export async function logoutService(body: RefreshBody) {
  const tokenHash = hashToken(body.refreshToken)
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })

  if (!stored || stored.revocado) return // idempotente

  // Revocar toda la familia para cerrar todas las sesiones del dispositivo
  await prisma.refreshToken.updateMany({
    where: { familyId: stored.familyId },
    data: { revocado: true },
  })
}
