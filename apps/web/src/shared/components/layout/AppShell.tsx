import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../modules/auth/hooks/useAuth'

const NAV_ITEMS = [
  { to: '/padron', label: 'Padrón Semanal' },
  { to: '/personas', label: 'Personas' },
  { to: '/cargos', label: 'Cargos' },
  { to: '/concursos/cph', label: 'Concursos CPH' },
  { to: '/concursos/ceetps', label: 'Concursos CEETPS' },
  { to: '/kpis', label: 'Tablero KPIs' },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) {
    navigate('/login')
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-sidebar bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-header flex items-center gap-3 px-4 border-b border-gray-200 bg-white">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-primary font-bold text-sm shrink-0">
            BA
          </div>
          <span className="font-primary font-bold text-gray-800 text-sm leading-tight">SRRHH v2</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-primary text-black'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

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

        {/* Usuario */}
        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-500 truncate">{user.username}</p>
          <p className="text-xs text-gray-400 capitalize mb-2">{user.rol}</p>
          <button onClick={logout} className="text-xs text-secondary hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-header bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
          <h1 className="font-primary font-bold text-gray-800 text-lg">
            Sistema de Recursos Humanos
          </h1>
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
