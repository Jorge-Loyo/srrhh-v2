import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'

// Layout con pestañas para el módulo Organigrama — "Área Programática" pasa
// de ser un ítem de nav anidado aparte (como estaba en S23-7) a una pestaña
// más acá adentro, mismo patrón que CargosLayout/BajasLayout. Las páginas de
// detalle (sección, hospital puntual, AP/CeSAC/unidad fija puntual) quedan
// FUERA del layout (no llevan la barra de pestañas), igual que CargoDetailPanel
// respecto de CargosLayout.
const TABS: Array<{ to: string; label: string; end: boolean; permiso?: { modulo: string; accion: string } }> = [
  { to: '/organigrama', label: 'Estructura', end: true },
  { to: '/organigrama/areas-programaticas', label: 'Área Programática', end: false, permiso: { modulo: 'dotacion', accion: 'ver' } },
]

export function OrganigramaLayout() {
  const { user } = useAuth()
  const tabs = TABS.filter((t) => !t.permiso || can(user, t.permiso.modulo, t.permiso.accion))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 flex gap-1 border-b border-gray-200 bg-white px-4">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors ${
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

      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
