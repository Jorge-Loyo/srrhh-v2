import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { can } from '@/shared/lib/can'
import { SinAccesoPage } from '@/shared/components/SinAccesoPage'

interface RequirePermisoProps {
  permiso: { modulo: string; accion: string }
}

/**
 * Guard de router genérico por permiso — defensa en profundidad además del
 * menú, que ya oculta lo que el usuario no puede usar. Acceso directo por URL
 * a algo sin permiso muestra "Sin acceso" en vez de la pantalla (el backend
 * igual rechaza con 403 vía requirePermiso).
 */
export function RequirePermiso({ permiso }: RequirePermisoProps) {
  const { user } = useAuth()
  if (!can(user, permiso.modulo, permiso.accion)) return <SinAccesoPage />
  return <Outlet />
}
