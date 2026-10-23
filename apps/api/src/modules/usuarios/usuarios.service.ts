import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CreateUsuarioBody, UpdateUsuarioBody } from './usuarios.schema.js'

// Selección explícita: nunca devolver passwordHash en ninguna respuesta.
const USUARIO_SELECT = {
  id: true,
  username: true,
  email: true,
  cuil: true,
  nombre: true,
  apellido: true,
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
  cuil: string | null
  nombre: string | null
  apellido: string | null
  roleId: string
  role: { nombre: string; slug: string }
  hospitalId: string | null
  activo: boolean
  createdAt: Date
}

// Normaliza un error P2002 de Prisma a un 409 con mensaje específico según el
// campo en conflicto (cuil/email/username), con fallback genérico.
function conflictoUsuario(error: PrismaClientKnownRequestError): AppError {
  const target = Array.isArray(error.meta?.target)
    ? (error.meta?.target as string[]).join(',')
    : String(error.meta?.target ?? '')
  if (target.includes('cuil')) return AppError.conflict('Ya existe un usuario con ese CUIL')
  if (target.includes('email')) return AppError.conflict('Ya existe un usuario con ese email')
  if (target.includes('username')) return AppError.conflict('Ya existe un usuario con ese username')
  return AppError.conflict('Ya existe un usuario con esos datos')
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
        // Email siempre en minúsculas: sostiene el invariante de casing que
        // usa el login por email (mode:'insensitive') y el backfill del script
        // de rollout. Hoy se escribía crudo, lo que dejaba filas con mayúsculas.
        email: body.email.toLowerCase().trim(),
        nombre: body.nombre.trim(),
        apellido: body.apellido.trim(),
        // CUIL crudo: es la clave de vinculación, se guarda tal cual (11 dígitos).
        cuil: body.cuil,
        passwordHash,
        roleId: body.roleId,
        hospitalId: body.hospitalId ?? null,
      },
      select: USUARIO_SELECT,
    })
    return toUsuarioDto(row)
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflictoUsuario(error)
    }
    throw error
  }
}

export async function updateUsuario(id: string, body: UpdateUsuarioBody) {
  const data: Prisma.UsuarioUncheckedUpdateInput = {}
  if (body.username !== undefined) data.username = body.username
  if (body.email !== undefined) data.email = body.email.toLowerCase().trim()
  if (body.nombre !== undefined) data.nombre = body.nombre.trim()
  if (body.apellido !== undefined) data.apellido = body.apellido.trim()
  if (body.cuil !== undefined) data.cuil = body.cuil
  if (body.roleId !== undefined) data.roleId = body.roleId
  if (body.hospitalId !== undefined) data.hospitalId = body.hospitalId

  try {
    const row = await prisma.usuario.update({
      where: { id },
      data,
      select: USUARIO_SELECT,
    })
    return toUsuarioDto(row)
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw conflictoUsuario(error)
      if (error.code === 'P2025') throw AppError.notFound('Usuario no encontrado')
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

export async function setUsuarioActivo(id: string, activo: boolean, requestingUserId: string) {
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
