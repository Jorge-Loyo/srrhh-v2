import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'

// Layout con pestañas para el módulo Cargos. El menú lateral parte Cargos en
// dos entradas independientes (ver AppShell): "Cargos" (Visualización → vista
// de consulta /cargos) y "Gestión de Cargos" (Gestión → Alta/Baja/Cobertura).
// La barra de pestañas de abajo refleja ese corte según la ruta activa:
//   - VISTA (/cargos y el detalle /cargos/:id): consulta pura, SIN barra de
//     pestañas de gestión (no se muestran Alta/Baja/Cobertura).
//   - GESTIÓN (/cargos/alta | /cargos/baja | /cargos/alta-por-baja): barra con
//     solo las pestañas de gestión; "Ver cargos" NO aparece acá.
// Cada pestaña de gestión se sigue filtrando por su permiso PROPIO `tab:*`
// (granular por pestaña), administrable por rol desde /configuracion/permisos.
const TABS_GESTION = [
  { to: '/cargos/alta',          label: 'Alta de cargo', end: false, permiso: { modulo: 'cargos', accion: 'tab:alta-cargo' } },
  { to: '/cargos/baja',          label: 'Baja de cargo', end: false, permiso: { modulo: 'cargos', accion: 'tab:baja-cargo' } },
  { to: '/cargos/alta-por-baja', label: 'Cobertura de vacantes', end: false, permiso: { modulo: 'cargos', accion: 'tab:cobertura-vacantes' } },
  // Paso 1 flujo concursos: bandeja mixta CPH + CEETPS (gestión del inicio).
  { to: '/cargos/concurso',      label: 'Concurso', end: false, permiso: { modulo: 'cargos', accion: 'tab:concurso' } },
  // Paso A flujo concursos: vista de los cargos de alta por concursar / en
  // concurso, ordenados por expediente. Va al lado de "Concurso".
  { to: '/cargos/nuevos-cargos', label: 'Nuevos cargos', end: false, permiso: { modulo: 'cargos', accion: 'tab:nuevos-cargos' } },
]

// Prefijos de ruta que corresponden a la GESTIÓN de cargos. Si la ruta activa
// no es ninguno de estos, estamos en la VISTA (consulta) y no se muestra la
// barra de pestañas de gestión.
const RUTAS_GESTION = ['/cargos/alta', '/cargos/baja', '/cargos/alta-por-baja', '/cargos/concurso', '/cargos/nuevos-cargos']

export function CargosLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  const enGestion = RUTAS_GESTION.some((r) => pathname === r || pathname.startsWith(r + '/'))
  const tabs = enGestion ? TABS_GESTION.filter((t) => can(user, t.permiso.modulo, t.permiso.accion)) : []

  return (
    <div className="space-y-6">
      {tabs.length > 0 && (
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
      )}

      <Outlet />
    </div>
  )
}
