import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import type { LoginBody, RefreshBody } from './auth.schema.js'

// Mismo patrón que padron.service.ts: Prisma.TransactionClient no está
// exportado en esta versión (5.22.0), así que se arma el tipo a mano.
type PrismaTx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// ─── helpers ────────────────────────────────────────────────────────────────

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function refreshExpiresAt() {
  // JWT_REFRESH_EXPIRES es "7d", "30d", etc.
  const match = env.JWT_REFRESH_EXPIRES.match(/^(\d+)([dhms])$/)
  if (!match) throw new Error('JWT_REFRESH_EXPIRES inválido')
  const value = parseInt(match[1]!)
  const unit = match[2]!
  const ms = unit === 'd' ? value * 86400000 : unit === 'h' ? value * 3600000 : unit === 'm' ? value * 60000 : value * 1000
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

  // Siempre correr bcrypt para igualar el tiempo de respuesta independientemente
  // de si el usuario existe — evita timing side-channel que permitiría enumerar usuarios.
  const hashToCompare = usuario?.passwordHash ?? '$2b$12$invalidhashpaddingtomatch.cost'
  const valid = await bcrypt.compare(body.password, hashToCompare)

  if (!usuario || !usuario.activo || !valid) throw AppError.unauthorized('Credenciales inválidas')

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

  // Transacción atómica: revoca el token y lo lee en una sola operación.
  // Evita la ventana de inconsistencia entre el updateMany y el findUnique
  // separados (si el findUnique fallaba después del updateMany, el token
  // quedaba revocado pero el usuario recibía 401 sin poder continuar).
  const stored = await prisma.$transaction(async (tx: PrismaTx) => {
    const updated = await tx.refreshToken.updateMany({
      where: { tokenHash, revocado: false },
      data: { revocado: true },
    })

    if (updated.count === 0) {
      // Reutilización detectada — revocar toda la familia
      const existing = await tx.refreshToken.findUnique({ where: { tokenHash } })
      if (existing) {
        await tx.refreshToken.updateMany({
          where: { familyId: existing.familyId },
          data: { revocado: true },
        })
      }
      throw AppError.unauthorized('Refresh token inválido o reutilizado — sesión revocada')
    }

    return tx.refreshToken.findUnique({ where: { tokenHash } })
  })

  if (!stored) throw AppError.unauthorized('Refresh token inválido')

  if (stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Refresh token expirado')
  }

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
