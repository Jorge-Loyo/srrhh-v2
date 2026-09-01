import { useState } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../../modules/auth/hooks/useAuth'
import { useSnapshots } from '../../../modules/padron/hooks/usePadron'

const CARGOS_SUBITEMS = [
  { to: '/cargos',            label: 'Ver cargos' },
  { to: '/cargos/alta',       label: 'Alta de cargo' },
  { to: '/cargos/baja',       label: 'Baja de cargo' },
  { to: '/cargos/alta-por-baja', label: 'Alta por baja' },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const { data: snapshots } = useSnapshots()
  const haySnapshotPendiente = snapshots?.some((s) => s.estado === 'pendiente') ?? false
  const location = useLocation()

  const [collapsed, setCollapsed]     = useState(false)
  const [cargosAbierto, setCargosAbierto] = useState(
    location.pathname.startsWith('/cargos')
  )

  if (!user) return null

  const sidebarW = collapsed ? 'w-14' : 'w-sidebar'

  return (
    <div className="flex h-screen bg-gray-50">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside
        className={`${sidebarW} bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200`}
      >
        {/* Logo + toggle */}
        <div className="h-header flex items-center border-b border-gray-200 bg-navy shrink-0 overflow-hidden">
          {!collapsed && (
            <div className="flex items-center gap-3 px-4 flex-1 min-w-0">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-primary font-bold text-sm shrink-0 text-black">
                BA
              </div>
              <span className="font-primary font-bold text-white text-sm leading-tight truncate">
                SRRHH v2
              </span>
            </div>
          )}
          {collapsed && (
            <div className="flex justify-center w-full">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-primary font-bold text-sm text-black">
                BA
              </div>
            </div>
          )}
        </div>

        {/* Botón colapsar — siempre visible */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="flex items-center justify-center gap-2 w-full py-2 border-b border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors text-xs font-semibold"
        >
          <span className="text-base leading-none">{collapsed ? '»' : '«'}</span>
          {!collapsed && <span>Colapsar</span>}
        </button>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">

          {/* KPIs */}
          <NavLink to="/kpis"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Tablero KPIs' : undefined}>
            <span className="text-base shrink-0">📊</span>
            {!collapsed && <span className="truncate">Tablero KPIs</span>}
          </NavLink>

          {/* Personas */}
          <NavLink to="/personas"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Personas' : undefined}>
            <span className="text-base shrink-0">👤</span>
            {!collapsed && <span className="truncate">Personas</span>}
          </NavLink>

          {/* Grupo Cargos */}
          <button type="button"
            onClick={() => !collapsed && setCargosAbierto((v) => !v)}
            title={collapsed ? 'Cargos' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${
              location.pathname.startsWith('/cargos') ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
            }`}>
            <span className="text-base shrink-0">🗂️</span>
            {!collapsed && (
              <>
                <span className="flex-1 text-left truncate">Cargos</span>
                <span className="text-xs">{cargosAbierto ? '▲' : '▼'}</span>
              </>
            )}
          </button>
          {cargosAbierto && !collapsed && (
            <div className="bg-gray-100 border-l-2 border-primary ml-4">
              {CARGOS_SUBITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} end
                  className={({ isActive }) =>
                    `block px-4 py-2 text-sm transition-colors ${
                      isActive ? 'font-bold text-secondary' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                    }`}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}

          {/* Bajas */}
          <NavLink to="/bajas"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Bajas' : undefined}>
            <span className="text-base shrink-0">🗑️</span>
            {!collapsed && <span className="truncate">Bajas</span>}
          </NavLink>

          {/* Validación de Bajas */}
          <NavLink to="/bajas/validacion"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Validación de Bajas' : undefined}>
            <span className="text-base shrink-0">⚠️</span>
            {!collapsed && <span className="truncate">Validación de Bajas</span>}
          </NavLink>

          {/* Divisor — Concursos */}
          <div className="border-t border-gray-200 mt-2 pt-2" />

          {/* Concursos */}
          <NavLink to="/concursos/cph"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Concursos CPH' : undefined}>
            <span className="text-base shrink-0">⚖️</span>
            {!collapsed && <span className="truncate">Concursos CPH</span>}
          </NavLink>
          <NavLink to="/concursos/ceetps"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Concursos CEETPS' : undefined}>
            <span className="text-base shrink-0">🏥</span>
            {!collapsed && <span className="truncate">Concursos CEETPS</span>}
          </NavLink>

          {/* Divisor — sección admin */}
          <div className="border-t border-gray-200 mt-2 pt-2" />

          {/* Padrón Semanal */}
          <NavLink to="/padron"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Padrón Semanal' : undefined}>
            <span className="text-base shrink-0">📋</span>
            {!collapsed && <span className="truncate">Padrón Semanal</span>}
          </NavLink>

          {/* Bajas Consolidadas */}
          <NavLink to="/bajas-consolidadas"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Bajas Consolidadas' : undefined}>
            <span className="text-base shrink-0">📄</span>
            {!collapsed && <span className="truncate">Bajas Consolidadas</span>}
          </NavLink>

          {/* Administración */}
          <NavLink to="/admin/usuarios"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`}
            title={collapsed ? 'Administración' : undefined}>
            <span className="text-base shrink-0">⚙️</span>
            {!collapsed && <span className="truncate">Administración</span>}
          </NavLink>

        </nav>

        {/* Pie del sidebar */}
        {!collapsed && (
          <div className="border-t border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400">v2.0</p>
          </div>
        )}
      </aside>

      {/* ── CONTENIDO PRINCIPAL ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}
