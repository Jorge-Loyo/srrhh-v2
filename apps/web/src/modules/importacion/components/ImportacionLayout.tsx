import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'

// Layout con pestañas para Importación: agrupa las cargas/importaciones que
// antes eran entradas sueltas del menú (Padrón Semanal, Bajas Consolidadas,
// Árbol Organigrama, Carga POU). Pestañas sincronizadas con la URL — cada una
// conserva su ruta original, así no se rompen enlaces existentes. Se filtran
// por su permiso PROPIO `tab:*`. Importación no es un módulo del catálogo: cada
// permiso de pestaña vive en el módulo real de su destino (padron, bajas-sial,
// configuracion).
const TABS = [
  { to: '/padron',            label: 'Padrón Semanal',     icono: '📋', end: true,  permiso: { modulo: 'padron', accion: 'tab:padron-semanal' } },
  { to: '/bajas-consolidadas', label: 'Bajas Consolidadas', icono: '📄', end: true,  permiso: { modulo: 'bajas-sial', accion: 'tab:bajas-consolidadas' } },
  { to: '/organigrama/arbol', label: 'Árbol Organigrama',  icono: '🌳', end: false, permiso: { modulo: 'configuracion', accion: 'tab:arbol-organigrama' } },
  { to: '/pou/carga',         label: 'Carga POU',          icono: '📥', end: false, permiso: { modulo: 'configuracion', accion: 'tab:carga-pou' } },
]

export function ImportacionLayout() {
  const { user } = useAuth()
  const tabs = TABS.filter((t) => can(user, t.permiso.modulo, t.permiso.accion))

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                isActive
                  ? 'border-secondary text-secondary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`
            }
          >
            <span>{t.icono}</span>
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
