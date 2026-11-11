// Única definición del criterio "es administrador" (slug fijo y protegido, ver
// roles.service.ts). El admin tiene gobernanza total: bypass de permisos y
// derecho a ver/resolver autorizaciones de cualquier rol resolutor.
export const ADMIN_ROL_SLUG = 'admin'

export function esAdmin(rolSlug: string | undefined | null): boolean {
  return rolSlug === ADMIN_ROL_SLUG
}
