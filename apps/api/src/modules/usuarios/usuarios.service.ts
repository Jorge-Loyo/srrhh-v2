import bcrypt from 'bcrypt'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CreateUsuarioBody } from './usuarios.schema.js'

// Selección explícita: nunca devolver passwordHash en ninguna respuesta.
const USUARIO_SELECT = {
  id: true,
  username: true,
  email: true,
  roleId: true,
  role: { select: { nombre: true, slug: true } },
  hospitalId: true,
  activo: true,
  createdAt: true,
} as const

type UsuarioRow = {
  id: string
  username: string
  email: string
  roleId: string
  role: { nombre: string; slug: string }
  hospitalId: string | null
  activo: boolean
  createdAt: Date
}

// Aplana `role: { nombre, slug }` → `rol` / `rolSlug`, coherente con el shape
// que ya devuelve el login (auth.service.ts) y con el tipo `Usuario` de @srrhh/types.
function toUsuarioDto(row: UsuarioRow) {
  const { role, ...rest } = row
  return { ...rest, rol: role.nombre, rolSlug: role.slug }
}

export async function listUsuarios() {
  const rows = await prisma.usuario.findMany({
    select: USUARIO_SELECT,
    orderBy: { username: 'asc' },
  })
  return rows.map(toUsuarioDto)
}

export async function createUsuario(body: CreateUsuarioBody) {
  const passwordHash = await bcrypt.hash(body.password, 12)

  try {
    const row = await prisma.usuario.create({
      data: {
        username: body.username,
        email: body.email,
        passwordHash,
        roleId: body.roleId,
        hospitalId: body.hospitalId ?? null,
      },
      select: USUARIO_SELECT,
    })
    return toUsuarioDto(row)
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      const campo = (error.meta?.target as string[] | undefined)?.[0] ?? 'username/email'
      throw AppError.conflict(`Ya existe un usuario con ese ${campo}`)
    }
    throw error
  }
}

export async function changePassword(id: string, password: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id } })
  if (!usuario) throw AppError.notFound('Usuario no encontrado')
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.usuario.update({ where: { id }, data: { passwordHash } })
}
  if (id === requestingUserId && !activo) {
    throw AppError.badRequest('No podés desactivar tu propio usuario')
  }

  const usuario = await prisma.usuario.findUnique({ where: { id } })
  if (!usuario) throw AppError.notFound('Usuario no encontrado')

  const row = await prisma.usuario.update({
    where: { id },
    data: { activo },
    select: USUARIO_SELECT,
  })
  return toUsuarioDto(row)
}
