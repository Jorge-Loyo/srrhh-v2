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

// ─── S13-E — jerarquía de roles ──────────────────────────────────────────────
// Cimientos para asignación de tareas en cascada (Sprint 14+): cada rol puede
// tener un rol "padre" (jefe). El seed de S13-3 solo carga un padre por hijo
// (árbol simple), aunque la PK compuesta de RoleJerarquia técnicamente permite
// más de uno — setJerarquia mantiene esa invariante de "un padre por rol" desde
// la UI, reemplazando cualquier fila previa del mismo hijo en vez de sumarla.

export async function listJerarquia() {
  return prisma.roleJerarquia.findMany({ orderBy: [{ rolHijoSlug: 'asc' }] })
}

async function assertSlugExiste(slug: string) {
  const role = await prisma.role.findUnique({ where: { slug } })
  if (!role) throw AppError.notFound(`Rol "${slug}" no encontrado`)
}

// Camina hacia arriba desde `desde` siguiendo rolPadreSlug — si encuentra
// `buscado` en el camino, asignar ese padre cerraría un ciclo.
async function creariaCiclo(desde: string, buscado: string): Promise<boolean> {
  let actual: string | null = desde
  const visitados = new Set<string>()
  while (actual) {
    if (actual === buscado) return true
    if (visitados.has(actual)) return false // ciclo preexistente ajeno — no es este el que lo causa
    visitados.add(actual)
    const fila: { rolPadreSlug: string } | null = await prisma.roleJerarquia.findFirst({
      where: { rolHijoSlug: actual },
      select: { rolPadreSlug: true },
    })
    actual = fila?.rolPadreSlug ?? null
  }
  return false
}

export async function setJerarquia(rolHijoSlug: string, rolPadreSlug: string | null) {
  await assertSlugExiste(rolHijoSlug)

  if (rolPadreSlug === null) {
    await prisma.roleJerarquia.deleteMany({ where: { rolHijoSlug } })
    return listJerarquia()
  }

  if (rolPadreSlug === rolHijoSlug) {
    throw AppError.badRequest('Un rol no puede ser su propio padre')
  }
  await assertSlugExiste(rolPadreSlug)
  if (await creariaCiclo(rolPadreSlug, rolHijoSlug)) {
    throw AppError.badRequest(`Asignar "${rolPadreSlug}" como padre de "${rolHijoSlug}" crearía un ciclo en la jerarquía`)
  }

  await prisma.$transaction([
    prisma.roleJerarquia.deleteMany({ where: { rolHijoSlug } }),
    prisma.roleJerarquia.create({ data: { rolHijoSlug, rolPadreSlug } }),
  ])

  return listJerarquia()
}
