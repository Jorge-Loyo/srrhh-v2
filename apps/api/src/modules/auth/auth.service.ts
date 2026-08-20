import bcrypt from 'bcrypt'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { LoginBody } from './auth.schema.js'

export async function loginService(body: LoginBody, signToken: (payload: object) => string) {
  const usuario = await prisma.usuario.findUnique({ where: { username: body.username } })

  if (!usuario || !usuario.activo) throw AppError.unauthorized('Credenciales inválidas')

  const valid = await bcrypt.compare(body.password, usuario.passwordHash)
  if (!valid) throw AppError.unauthorized('Credenciales inválidas')

  const accessToken = signToken({
    id: usuario.id,
    username: usuario.username,
    rol: usuario.rol,
    hospitalId: usuario.hospitalId,
  })

  return {
    accessToken,
    user: {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      rol: usuario.rol,
      hospitalId: usuario.hospitalId,
    },
  }
}
