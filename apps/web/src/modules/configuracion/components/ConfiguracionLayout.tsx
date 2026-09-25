import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'

// Layout con pestañas para Configuración. Reemplaza el desplegable del menú:
// "Configuración" es un NavLink simple y cada sección es una pestaña
// sincronizada con la URL (conserva su ruta → no rompe enlaces directos).
// Los permisos de cada pestaña son los MISMOS que protegen su ruta en el
// router (RequirePermiso), para no mostrar una pestaña que luego daría 403.
const TABS = [
  { to: '/configuracion/usuarios',    label: 'Usuarios',              permiso: { modulo: 'configuracion', accion: 'gestionar_usuarios' } },
  { to: '/configuracion/tokens',      label: 'Tokens',                permiso: { modulo: 'configuracion', accion: 'gestionar_usuarios' } },
  { to: '/configuracion/jerarquia',   label: 'Jerarquía',             permiso: { modulo: 'configuracion', accion: 'gestionar_usuarios' } },
  { to: '/configuracion/permisos',    label: 'Permisos',              permiso: { modulo: 'configuracion', accion: 'gestionar_permisos' } },
  { to: '/configuracion/referencias', label: 'Referencias Dotaneitor', permiso: { modulo: 'configuracion', accion: 'gestionar_permisos' } },
  { to: '/configuracion/auditoria',   label: 'Auditoría',             permiso: { modulo: 'configuracion', accion: 'ver_auditoria' } },
]

export function ConfiguracionLayout() {
  const { user } = useAuth()
  const tabs = TABS.filter((t) => can(user, t.permiso.modulo, t.permiso.accion))

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
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
