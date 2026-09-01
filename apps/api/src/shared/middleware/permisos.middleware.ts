import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../prisma.js'
import { AppError } from '../errors/AppError.js'

export interface PermisoRef {
  modulo: string
  accion: string
}

/**
 * Reemplaza al viejo requireRole([...]) — en vez de comparar contra una lista de
 * roles hardcodeada en cada archivo de rutas, consulta la tabla role_permisos.
 * Editable en caliente por el admin desde /configuracion/permisos, sin deploy.
 *
 * `permiso` acepta un solo (modulo, accion) o un arreglo — con semántica OR, para
 * endpoints que un usuario puede alcanzar por más de un camino (ver
 * concursos.routes.ts: un único POST / crea tanto concursos CPH como CEETPS).
 *
 * El rol "admin" (slug fijo, protegido — ver roles.service.ts) siempre pasa, sin
 * necesidad de que existan filas en role_permisos para él.
 */
export function requirePermiso(permiso: PermisoRef | PermisoRef[]) {
  const opciones = Array.isArray(permiso) ? permiso : [permiso]

  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user as { roleId?: string; rolSlug?: string } | undefined
    if (!user?.roleId || !user.rolSlug) throw AppError.forbidden()
    if (user.rolSlug === 'admin') return

    const tienePermiso = await prisma.rolePermiso.findFirst({
      where: {
        roleId: user.roleId,
        permiso: { OR: opciones.map((p) => ({ modulo: p.modulo, accion: p.accion })) },
      },
    })
    if (!tienePermiso) throw AppError.forbidden()
  }
}
