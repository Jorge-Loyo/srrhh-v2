import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'

// Layout con pestañas para el módulo Cargos. Reemplaza el desplegable del menú:
// "Cargos" es un NavLink simple a /cargos y las acciones (Alta, Baja, Alta por
// baja) son pestañas sincronizadas con la URL — cada una conserva su ruta, así
// no se rompen los enlaces directos existentes. Las pestañas se filtran por
// permiso (base para evaluar permisos por pestaña más adelante).
const TABS = [
  { to: '/cargos',               label: 'Ver cargos',   end: true,  permiso: { modulo: 'cargos', accion: 'ver' } },
  { to: '/cargos/alta',          label: 'Alta de cargo', end: false, permiso: { modulo: 'cargos', accion: 'crear' } },
  { to: '/cargos/baja',          label: 'Baja de cargo', end: false, permiso: { modulo: 'bajas', accion: 'crear' } },
  { to: '/cargos/alta-por-baja', label: 'Alta por baja', end: false, permiso: { modulo: 'bajas', accion: 'crear' } },
]

export function CargosLayout() {
  const { user } = useAuth()
  const tabs = TABS.filter((t) => can(user, t.permiso.modulo, t.permiso.accion))

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                isActive
                  ? 'border-secondary text-secondary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
