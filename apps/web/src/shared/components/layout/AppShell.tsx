import { useState } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../../modules/auth/hooks/useAuth'
import { useSnapshots } from '../../../modules/padron/hooks/usePadron'

const CARGOS_SUBITEMS = [
  { to: '/cargos', label: 'Ver cargos' },
  { to: '/cargos/alta', label: 'Alta de cargo' },
  { to: '/cargos/baja', label: 'Baja de cargo' },
  { to: '/cargos/alta-por-baja', label: 'Alta por baja' },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const { data: snapshots } = useSnapshots()
  const haySnapshotPendiente = snapshots?.some((s) => s.estado === 'pendiente') ?? false
  const location = useLocation()
  // El grupo Cargos arranca abierto si la ruta actual es cualquiera de sus sub-ítems.
  const [cargosAbierto, setCargosAbierto] = useState(
    location.pathname.startsWith('/cargos')
  )

  // AppShell solo se monta detrás de <ProtectedRoute>, que ya garantiza sesión
  // activa — este chequeo es un guard defensivo para TypeScript, no un flujo
  // real (si llega a pasar, ProtectedRoute ya redirigió a /login).
  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-sidebar bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-header flex items-center gap-3 px-4 border-b border-gray-200 bg-navy">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-primary font-bold text-sm shrink-0 text-black">
            BA
          </div>
          <span className="font-primary font-bold text-white text-sm leading-tight">SRRHH v2</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <NavLink
            to="/padron"
            className={({ isActive }) =>
              `block px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            Padrón Semanal
          </NavLink>

          <NavLink
            to="/personas"
            className={({ isActive }) =>
              `block px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            Personas
          </NavLink>

          {/* Grupo Cargos — desplegable con Alta, Baja y Alta por baja */}
          <button
            type="button"
            onClick={() => setCargosAbierto((v) => !v)}
            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${
              location.pathname.startsWith('/cargos')
                ? 'bg-primary text-black'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>Cargos</span>
            <span className="text-xs">{cargosAbierto ? '▲' : '▼'}</span>
          </button>
          {cargosAbierto && (
            <div className="bg-gray-100 border-l-2 border-primary ml-4">
              {CARGOS_SUBITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `block px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? 'font-bold text-secondary'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}

          <NavLink
            to="/concursos/cph"
            className={({ isActive }) =>
              `block px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            Concursos CPH
          </NavLink>

          <NavLink
            to="/concursos/ceetps"
            className={({ isActive }) =>
              `block px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            Concursos CEETPS
          </NavLink>

          <NavLink
            to="/kpis"
            className={({ isActive }) =>
              `block px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            Tablero KPIs
          </NavLink>

          <div className="border-t border-gray-200 mt-4 pt-4">
            <NavLink
              to="/admin/usuarios"
              className={({ isActive }) =>
                `block px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              Administración
            </NavLink>
          </div>
        </nav>

        {/* Separador inferior del sidebar */}
        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-400">v2.0</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header — Azul Noche Obelisco GCBA */}
        <header className="h-header bg-navy flex items-center justify-between shrink-0">
          <h1 className="font-primary font-bold text-white text-lg px-6">
            Sistema de Recursos Humanos
          </h1>
          <div className="flex items-center h-full">
            {haySnapshotPendiente && (
              <Link to="/padron" className="badge-warning hover:opacity-80 transition-opacity mr-4">
                ● Padrón pendiente de revisión
              </Link>
            )}
            {/* Área de perfil — Amarillo BA */}
            <div className="h-full bg-primary flex items-center gap-3 px-5">
              <div className="text-right">
                <p className="text-xs font-bold text-black leading-tight">{user.username}</p>
                <p className="text-[10px] text-black/70 capitalize">{user.rol.replace(/_/g, ' ')}</p>
              </div>
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 transition-colors flex items-center justify-center text-black text-xs font-bold"
              >
                ✕
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-content mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
