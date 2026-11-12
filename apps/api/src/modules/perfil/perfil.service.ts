import bcrypt from 'bcrypt'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { UpdatePerfilBody } from './perfil.schema.js'

// Allow-list explícita: USUARIO_SELECT + cuil/nombre/apellido, NUNCA
// passwordHash. El GET/PATCH de perfil jamás devuelve el hash.
const PERFIL_SELECT = {
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

type PerfilRow = {
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

// Aplana `role: { nombre, slug }` → `rol` / `rolSlug`, coherente con el login
// y con el tipo `Usuario` de @srrhh/types.
function toPerfilDto(row: PerfilRow) {
  const { role, ...rest } = row
  return { ...rest, rol: role.nombre, rolSlug: role.slug }
}

// Barrera DURA de inmutabilidad del CUIL, independiente del schema: arma el
// `data` del update tomando SOLO los campos editables; `cuil` NUNCA se mapea,
// aunque venga en la entrada. Función pura para testearla sin Prisma.
export function buildUpdatePerfilData(data: UpdatePerfilBody) {
  const out: { nombre?: string; apellido?: string; email?: string; username?: string } = {}
  if (data.nombre !== undefined) out.nombre = data.nombre
  if (data.apellido !== undefined) out.apellido = data.apellido
  if (data.email !== undefined) out.email = data.email
  if (data.username !== undefined) out.username = data.username
  return out
}

// Verificación PURA de la contraseña actual contra el hash guardado. Aislada
// para testearla con bcrypt.hashSync sin tocar la DB.
export async function verificarPasswordActual(passwordActual: string, hash: string) {
  return bcrypt.compare(passwordActual, hash)
}

export async function getPerfil(id: string) {
  const row = await prisma.usuario.findUnique({ where: { id }, select: PERFIL_SELECT })
  if (!row) throw AppError.notFound('Usuario no encontrado')
  return toPerfilDto(row)
}

export async function updatePerfil(id: string, data: UpdatePerfilBody) {
  const updateData = buildUpdatePerfilData(data)

  // PATCH vacío: no-op válido, devolver el perfil actual.
  if (Object.keys(updateData).length === 0) return getPerfil(id)

  try {
    const row = await prisma.usuario.update({
      where: { id },
      data: updateData,
      select: PERFIL_SELECT,
    })
    return toPerfilDto(row)
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      const campo = (error.meta?.target as string[] | undefined)?.[0] ?? 'username/email'
      throw AppError.conflict(`Ya existe un usuario con ese ${campo}`)
    }
    throw error
  }
}

export async function changePasswordPerfil(
  id: string,
  { passwordActual, passwordNueva }: { passwordActual: string; passwordNueva: string }
) {
  // Trae el hash para uso interno; NUNCA se devuelve ni se loguea.
  const usuario = await prisma.usuario.findUnique({ where: { id } })
  if (!usuario) throw AppError.notFound('Usuario no encontrado')

  const actualValida = await verificarPasswordActual(passwordActual, usuario.passwordHash)
  if (!actualValida) throw AppError.unauthorized('Contraseña actual incorrecta')

  const passwordHash = await bcrypt.hash(passwordNueva, 12)
  await prisma.usuario.update({ where: { id }, data: { passwordHash } })
  return { ok: true }
}
