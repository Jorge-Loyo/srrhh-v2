import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Defensa en profundidad para /configuracion/* — el menú ya oculta estos ítems
 * a quien no sea admin, pero acceso directo por URL debe bloquearse igual (el
 * backend igual rechaza con 403 vía requirePermiso, esto solo evita mostrar la
 * pantalla vacía/rota mientras tanto).
 */
export function RequireAdmin() {
  const { user } = useAuth()
  if (user?.rolSlug !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
