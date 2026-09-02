import { prisma } from '../../shared/prisma.js'

// Catálogo completo — cada fila es un punto de aplicación real o reservado
// (autorizaciones/notificaciones, Sprint 10/11) de requirePermiso en el backend.
// Lo consume ConfiguracionPermisosPage para renderizar la matriz módulo → acción.
export async function getCatalogo() {
  return prisma.permiso.findMany({
    orderBy: [{ modulo: 'asc' }, { accion: 'asc' }],
  })
}

export interface PermisoEfectivo {
  modulo: string
  accion: string
}

// Permisos reales de un usuario — se agregan a la respuesta de login para que el
// frontend (helper can()) sepa qué mostrar/habilitar sin volver a pedirlo. "admin"
// es un bypass explícito en requirePermiso (siempre pasa) — acá se materializa
// como "tiene todo el catálogo" para que la UI no tenga que conocer ese caso especial.
export async function getPermisosEfectivos(roleId: string, rolSlug: string): Promise<PermisoEfectivo[]> {
  if (rolSlug === 'admin') {
    const catalogo = await getCatalogo()
    return catalogo.map((p) => ({ modulo: p.modulo, accion: p.accion }))
  }

  const rolePermisos = await prisma.rolePermiso.findMany({
    where: { roleId },
    include: { permiso: { select: { modulo: true, accion: true } } },
  })
  return rolePermisos.map((rp) => rp.permiso)
}
