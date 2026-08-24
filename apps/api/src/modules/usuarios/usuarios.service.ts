import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CreateUsuarioBody } from './usuarios.schema.js'

// Selección explícita: nunca devolver passwordHash en ninguna respuesta.
const USUARIO_SELECT = {
  id: true,
  username: true,
  email: true,
  rol: true,
  hospitalId: true,
  activo: true,
  createdAt: true,
} satisfies Prisma.UsuarioSelect

export async function listUsuarios() {
  return prisma.usuario.findMany({
    select: USUARIO_SELECT,
    orderBy: { username: 'asc' },
  })
}

export async function createUsuario(body: CreateUsuarioBody) {
  const passwordHash = await bcrypt.hash(body.password, 12)

  try {
    return await prisma.usuario.create({
      data: {
        username: body.username,
        email: body.email,
        passwordHash,
        rol: body.rol,
        hospitalId: body.hospitalId ?? null,
      },
      select: USUARIO_SELECT,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const campo = (error.meta?.target as string[] | undefined)?.[0] ?? 'username/email'
      throw AppError.conflict(`Ya existe un usuario con ese ${campo}`)
    }
    throw error
  }
}

export async function setUsuarioActivo(id: string, activo: boolean, requestingUserId: string) {
  if (id === requestingUserId && !activo) {
    throw AppError.badRequest('No podés desactivar tu propio usuario')
  }

  const usuario = await prisma.usuario.findUnique({ where: { id } })
  if (!usuario) throw AppError.notFound('Usuario no encontrado')

  return prisma.usuario.update({
    where: { id },
    data: { activo },
    select: USUARIO_SELECT,
  })
}
