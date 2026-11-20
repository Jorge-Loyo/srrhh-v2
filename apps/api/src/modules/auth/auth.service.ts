import bcrypt from 'bcrypt'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { getPermisosEfectivos } from '../permisos/permisos.service.js'
import type { LoginBody } from './auth.schema.js'

// refresh_tokens fue dropeada (D4). El refresh se reimplementará cuando corresponda.
// Por ahora el login devuelve solo accessToken; el cliente debe re-autenticar al expirar.

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

// Función PURA de precedencia de la resolución del identificador de login.
// username SIEMPRE tiene precedencia sobre cuil/email.
export function resolverUsuarioLogin<T>(porUsername: T | null, porCuilOEmail: T | null): T | null {
  return porUsername ?? porCuilOEmail ?? null
}

export async function loginService(body: LoginBody, signToken: (payload: object) => string) {
  const id = body.identificador

  const porUsername = await prisma.usuario.findUnique({
    where: { username: id },
    include: { role: true },
  })

  const porCuilOEmail = porUsername
    ? null
    : await prisma.usuario.findFirst({
        where: {
          OR: [
            { cuil: id },
            { email: { equals: id, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: { role: true },
      })

  const usuario = resolverUsuarioLogin(porUsername, porCuilOEmail)

  const hashToCompare = usuario?.passwordHash ?? '$2b$12$invalidhashpaddingtomatch.cost'
  const valid = await bcrypt.compare(body.password, hashToCompare)

  if (!usuario || !usuario.activo || !valid) throw AppError.unauthorized('Credenciales inválidas')

  const accessToken = signToken(buildUserPayload(usuario))
  const permisos = await getPermisosEfectivos(usuario.roleId, usuario.role.slug)

  return {
    accessToken,
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
