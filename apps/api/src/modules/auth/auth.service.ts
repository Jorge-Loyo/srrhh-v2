import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import { getPermisosEfectivos } from '../permisos/permisos.service.js'
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

async function createRefreshToken(usuarioId: string, familyId: string, ip: string | null) {
  const raw = crypto.randomBytes(40).toString('hex')
  await prisma.refreshToken.create({
    data: {
      usuarioId,
      tokenHash: hashToken(raw),
      familyId,
      expiresAt: refreshExpiresAt(),
      ip,
    },
  })
  return raw
}

// El JWT lleva roleId + rolSlug (no la lista de permisos, que puede cambiar en
// caliente — requirePermiso la resuelve fresca en cada request contra la BD, así
// un cambio de permisos hecho por el admin aplica de inmediato a sesiones activas).
function buildUserPayload(usuario: {
  id: string
  username: string
  roleId: string
  role: { slug: string }
  hospitalId: string | null
}) {
  return {
    id: usuario.id,
    username: usuario.username,
    roleId: usuario.roleId,
    rolSlug: usuario.role.slug,
    hospitalId: usuario.hospitalId,
  }
}

// ─── login ───────────────────────────────────────────────────────────────────

// Función PURA de precedencia de la resolución del identificador de login.
// Recibe los DOS resultados ya consultados (match exacto por username y match
// por cuil/email) y decide cuál gana: username SIEMPRE tiene precedencia.
// Esto preserva la semántica del login actual (findUnique por username) y
// garantiza la Prioridad #1 (no romper el login existente): si un valor es
// username de alguien, resuelve a ese alguien sin importar colisiones
// cross-column. Aislada como función pura para testearla sin Prisma (patrón
// del repo: tests de lógica pura sin vi.mock).
export function resolverUsuarioLogin<T>(porUsername: T | null, porCuilOEmail: T | null): T | null {
  return porUsername ?? porCuilOEmail ?? null
}

export async function loginService(body: LoginBody, signToken: (payload: object) => string, ip: string | null = null) {
  const id = body.identificador // ya viene .trim() del schema

  // PASO 1 — precedencia de username (preserva el comportamiento actual del
  // login). Equivale al findUnique({ where: { username } }) de hoy.
  const porUsername = await prisma.usuario.findUnique({
    where: { username: id },
    include: { role: true },
  })

  // PASO 2 — solo si username no matcheó: resolver por cuil (exacto) o email
  // (case-insensitive vía mode:'insensitive', sin depender del casing guardado).
  const porCuilOEmail = porUsername
    ? null
    : await prisma.usuario.findFirst({
        where: {
          OR: [
            { cuil: id }, // exacto (numérico)
            { email: { equals: id, mode: 'insensitive' } }, // case-insensitive
          ],
        },
        orderBy: { createdAt: 'asc' }, // determinístico ante colisión residual
        include: { role: true },
      })

  const usuario = resolverUsuarioLogin(porUsername, porCuilOEmail)

  // Siempre correr bcrypt para igualar el tiempo de respuesta independientemente
  // de si el usuario existe — evita timing side-channel que permitiría enumerar usuarios.
  const hashToCompare = usuario?.passwordHash ?? '$2b$12$invalidhashpaddingtomatch.cost'
  const valid = await bcrypt.compare(body.password, hashToCompare)

  if (!usuario || !usuario.activo || !valid) throw AppError.unauthorized('Credenciales inválidas')

  const familyId = crypto.randomUUID()
  const accessToken = signToken(buildUserPayload(usuario))
  const refreshToken = await createRefreshToken(usuario.id, familyId, ip)
  const permisos = await getPermisosEfectivos(usuario.roleId, usuario.role.slug)

  return {
    accessToken,
    refreshToken,
    user: {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      cuil: usuario.cuil,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      rol: usuario.role.nombre,
      rolSlug: usuario.role.slug,
      roleId: usuario.roleId,
      hospitalId: usuario.hospitalId,
      permisos,
    },
  }
}

// ─── refresh ─────────────────────────────────────────────────────────────────

export async function refreshTokenService(body: RefreshBody, signToken: (payload: object) => string, ip: string | null = null) {
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

    if (updated.count === 0) return null // reutilización — se maneja fuera de la transacción, ver abajo

    return tx.refreshToken.findUnique({ where: { tokenHash } })
  })

  if (!stored) {
    // Reutilización detectada — revocar toda la familia. A propósito FUERA
    // de la transacción de arriba: revocar la familia y después tirar
    // AppError.unauthorized() *dentro* del mismo $transaction() hacía que
    // Prisma revirtiera la transacción completa al lanzar la excepción —
    // incluida la propia revocación de seguridad, que se suponía tenía que
    // sobrevivir al error. Efecto real: el intento de reuso se rechazaba
    // (401) pero la familia quedaba sin revocar, así que el refresh token
    // legítimo (todavía vigente) seguía funcionando después — la defensa
    // contra robo de token nunca se activaba. Encontrado verificando Sprint 1
    // contra el comportamiento real, no solo el código (2026-08-28).
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (existing) {
      await prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId },
        data: { revocado: true },
      })
    }
    throw AppError.unauthorized('Refresh token inválido o reutilizado — sesión revocada')
  }

  if (stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Refresh token expirado')
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: stored.usuarioId },
    include: { role: true },
  })
  if (!usuario || !usuario.activo) throw AppError.unauthorized('Usuario inactivo')

  const accessToken = signToken(buildUserPayload(usuario))
  const newRefreshToken = await createRefreshToken(usuario.id, stored.familyId, ip)

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
