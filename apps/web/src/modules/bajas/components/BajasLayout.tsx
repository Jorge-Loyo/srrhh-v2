import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'

// Layout con pestañas para Bajas: Bajas / Validación / Vinculaciones.
// Pestañas sincronizadas con la URL (cada una conserva su ruta). Reemplaza las
// entradas sueltas del menú "Bajas" y "Validación de Bajas".
const TABS = [
  { to: '/bajas',            label: 'Bajas',         end: true,  permiso: { modulo: 'bajas', accion: 'crear' } },
  { to: '/bajas/validacion', label: 'Validación',    end: false, permiso: { modulo: 'bajas', accion: 'crear' } },
  { to: '/bajas/vinculacion', label: 'Vinculaciones', end: false, permiso: { modulo: 'bajas', accion: 'crear' } },
]

export function BajasLayout() {
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
