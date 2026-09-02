import { randomUUID } from 'crypto'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CreateRoleBody, UpdateRoleBody } from './roles.schema.js'

const ROLE_SELECT = {
  id: true,
  slug: true,
  nombre: true,
  descripcion: true,
  esSistema: true,
  activo: true,
  permisos: { select: { permiso: { select: { id: true, modulo: true, accion: true } } } },
} as const

// slug estable y único, no editable después de creado — mismo patrón que
// Escalafon.codigo (padron.service.ts): nombre normalizado + sufijo random.
function buildSlug(nombre: string) {
  const base = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca acentos (después de normalize('NFD'))
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28)
  return `${base || 'rol'}_${randomUUID().slice(0, 7)}`
}

async function getRoleOrThrow(id: string) {
  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) throw AppError.notFound('Rol no encontrado')
  return role
}

// El rol "admin" queda protegido: siempre acceso total (bypass en requirePermiso),
// no editable ni borrable desde acá — evita que alguien se bloquee a sí mismo el
// único camino de vuelta a /configuracion/permisos.
function assertNoEsAdminProtegido(role: { slug: string }) {
  if (role.slug === 'admin') {
    throw AppError.forbidden('El rol "admin" está protegido — no se puede editar ni borrar')
  }
}

export async function listRoles() {
  return prisma.role.findMany({ select: ROLE_SELECT, orderBy: { createdAt: 'asc' } })
}

export async function createRole(body: CreateRoleBody) {
  return prisma.role.create({
    data: { slug: buildSlug(body.nombre), nombre: body.nombre, descripcion: body.descripcion ?? null },
    select: ROLE_SELECT,
  })
}

export async function updateRole(id: string, body: UpdateRoleBody) {
  const role = await getRoleOrThrow(id)
  assertNoEsAdminProtegido(role)

  return prisma.role.update({
    where: { id },
    data: {
      nombre: body.nombre,
      descripcion: body.descripcion,
      activo: body.activo,
    },
    select: ROLE_SELECT,
  })
}

export async function deleteRole(id: string) {
  const role = await getRoleOrThrow(id)
  assertNoEsAdminProtegido(role)

  if (role.esSistema) {
    throw AppError.badRequest('Los roles de sistema no se pueden eliminar — se pueden desactivar')
  }

  const usuariosAsignados = await prisma.usuario.count({ where: { roleId: id } })
  if (usuariosAsignados > 0) {
    throw AppError.conflict(
      `Hay ${usuariosAsignados} usuario(s) con este rol asignado — reasigná antes de borrarlo`
    )
  }

  await prisma.role.delete({ where: { id } })
}

export async function setRolePermisos(id: string, permisoIds: string[]) {
  const role = await getRoleOrThrow(id)
  assertNoEsAdminProtegido(role)

  await prisma.$transaction([
    prisma.rolePermiso.deleteMany({ where: { roleId: id } }),
    prisma.rolePermiso.createMany({
      data: permisoIds.map((permisoId) => ({ roleId: id, permisoId })),
      skipDuplicates: true,
    }),
  ])

  return prisma.role.findUnique({ where: { id }, select: ROLE_SELECT })
}
