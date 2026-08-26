import { Outlet, NavLink, Link } from 'react-router-dom'
import { useAuth } from '../../../modules/auth/hooks/useAuth'
import { useSnapshots } from '../../../modules/padron/hooks/usePadron'

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
  // S2-11: si hay algún snapshot pendiente de revisión, se avisa en el header
  // sin importar en qué página esté parado el usuario. En teoría nunca hay
  // más de uno a la vez (S2-12 bloquea subir un padrón nuevo mientras hay uno
  // pendiente), pero el chequeo no asume esa invariante por las dudas.
  const { data: snapshots } = useSnapshots()
  const haySnapshotPendiente = snapshots?.some((s) => s.estado === 'pendiente') ?? false

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
        <div className="h-header flex items-center gap-3 px-4 border-b border-gray-200 bg-[#1A2B4A]">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-primary font-bold text-sm shrink-0 text-black">
            BA
          </div>
          <span className="font-primary font-bold text-white text-sm leading-tight">SRRHH v2</span>
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

        {/* Separador inferior del sidebar */}
        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-400">v2.0</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header — Azul Noche Obelisco GCBA */}
        <header className="h-header bg-[#1A2B4A] flex items-center justify-between shrink-0">
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
