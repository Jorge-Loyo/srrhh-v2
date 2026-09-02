import type { Usuario } from '@srrhh/types'

/**
 * ¿El usuario puede hacer `accion` en `modulo`? Consulta `user.permisos`, que
 * viaja en la respuesta de login (ver auth.service.ts → getPermisosEfectivos).
 * Para admin esa lista ya viene con el catálogo completo — no hace falta un
 * caso especial acá.
 */
export function can(user: Usuario | null | undefined, modulo: string, accion: string): boolean {
  return !!user?.permisos?.some((p) => p.modulo === modulo && p.accion === accion)
}
