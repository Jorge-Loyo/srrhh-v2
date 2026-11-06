import { Suspense, useState } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../../modules/auth/hooks/useAuth'
import { useSnapshots } from '../../../modules/padron/hooks/usePadron'
import { useNotificacionesNoLeidas } from '../../../modules/notificaciones/hooks/useNotificaciones'
import { useAutorizacionesPendientes } from '../../../modules/autorizaciones/hooks/useAutorizaciones'
import { useTareasPendientes } from '../../../modules/tareas/hooks/useTareas'
import { can } from '../../lib/can'
import { SuspenseFallback } from '../SuspenseFallback'

// Permisos por pestaña `tab:*`: el sidebar oculta exactamente lo que el layout
// oculta (el gate de cada sub-ítem usa el MISMO permiso que su pestaña).
//
// SPLIT DE CARGOS: la entrada "Cargos" de Visualización gobierna SOLO la
// pestaña de consulta (tab:ver-cargos → /cargos). Las pestañas de gestión
// (alta / baja / cobertura) viven en una entrada independiente "Gestión de
// Cargos" (grupo Gestión), que abre en la 1ª pestaña con permiso usando el
// patrón `subitems[0].to` (igual que Bajas/Importación/Configuración). Son
// independientes: el usuario puede ver una, la otra, ambas o ninguna.
const CARGOS_VER_PERMISO = { modulo: 'cargos', accion: 'tab:ver-cargos' }

const CARGOS_GESTION_SUBITEMS = [
  { to: '/cargos/alta',          label: 'Alta de cargo',         permiso: { modulo: 'cargos', accion: 'tab:alta-cargo' } },
  { to: '/cargos/baja',          label: 'Baja de cargo',         permiso: { modulo: 'cargos', accion: 'tab:baja-cargo' } },
  { to: '/cargos/alta-por-baja', label: 'Cobertura de vacantes', permiso: { modulo: 'cargos', accion: 'tab:cobertura-vacantes' } },
]

const BAJAS_SUBITEMS = [
  { to: '/bajas',            permiso: { modulo: 'bajas', accion: 'tab:bajas' } },
  // FASE 6: pestaña /bajas/validacion (ValidacionBajasPage) jubilada — su
  // función la cubren las pestañas nuevas de Incidencias. El permiso
  // bajas/tab:validacion queda sin UI (no se borra; F6 no lleva migración).
  { to: '/bajas/vinculacion', permiso: { modulo: 'bajas', accion: 'tab:vinculaciones' } },
]

const IMPORTACION_SUBITEMS = [
  { to: '/padron',            permiso: { modulo: 'padron', accion: 'tab:padron-semanal' } },
  { to: '/bajas-consolidadas', permiso: { modulo: 'bajas-sial', accion: 'tab:bajas-consolidadas' } },
  { to: '/organigrama/arbol', permiso: { modulo: 'configuracion', accion: 'tab:arbol-organigrama' } },
  { to: '/pou/carga',         permiso: { modulo: 'configuracion', accion: 'tab:carga-pou' } },
]

const CONFIGURACION_SUBITEMS = [
  { to: '/configuracion/usuarios',  label: 'Usuarios',   permiso: { modulo: 'configuracion', accion: 'tab:usuarios' } },
  { to: '/configuracion/tokens',    label: 'Tokens',      permiso: { modulo: 'configuracion', accion: 'tab:tokens' } },
  { to: '/configuracion/permisos',  label: 'Permisos',   permiso: { modulo: 'configuracion', accion: 'tab:permisos' } },
  { to: '/configuracion/jerarquia', label: 'Jerarquía',  permiso: { modulo: 'configuracion', accion: 'tab:jerarquia' } },
  { to: '/configuracion/referencias', label: 'Referencias Dotaneitor', permiso: { modulo: 'configuracion', accion: 'tab:referencias' } },
  { to: '/configuracion/auditoria', label: 'Auditoría', permiso: { modulo: 'configuracion', accion: 'tab:auditoria' } },
]

// Cabecera de grupo del sidebar: título en mayúsculas (estilo sutil) con
// separador superior. Cuando el menú está colapsado solo se muestra la línea
// separadora (sin el texto, que no entra en el ancho reducido).
function GroupHeader({ titulo, collapsed }: { titulo: string; collapsed: boolean }) {
  if (collapsed) return <div className="border-t border-gray-200 mt-2 pt-2" />
  return (
    <div className="mt-3 mb-1 border-t border-gray-200 pt-2 px-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{titulo}</p>
    </div>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const { data: snapshots } = useSnapshots()
  const { data: noLeidas = 0 } = useNotificacionesNoLeidas()
  const puedeVerAutorizaciones = can(user, 'autorizaciones', 'ver')
  const { data: autorizacionesPendientes = 0 } = useAutorizacionesPendientes(puedeVerAutorizaciones)
  const { data: tareasPendientes = 0 } = useTareasPendientes()
  const haySnapshotPendiente = snapshots?.some((s) => s.estado === 'pendiente') ?? false
  const location = useLocation()

  const [collapsed, setCollapsed]     = useState(false)

  if (!user) return null

  const sidebarW = collapsed ? 'w-14' : 'w-sidebar'

  // Cada ítem/grupo se filtra por lo que el usuario puede hacer de verdad
  // (user.permisos, calculado server-side en el login) — no por rolSlug a mano.
  const cargosGestionSubitems = CARGOS_GESTION_SUBITEMS.filter((item) => can(user, item.permiso.modulo, item.permiso.accion))
  const bajasSubitems = BAJAS_SUBITEMS.filter((item) => can(user, item.permiso.modulo, item.permiso.accion))
  const importacionSubitems = IMPORTACION_SUBITEMS.filter((item) => can(user, item.permiso.modulo, item.permiso.accion))
  const configuracionSubitems = CONFIGURACION_SUBITEMS.filter((item) => can(user, item.permiso.modulo, item.permiso.accion))

  // Visibilidad de cada ítem, calculada una vez. El sidebar se arma en 3 grupos
  // nombrados; un grupo entero se OCULTA si no tiene ningún ítem visible (no se
  // pinta la cabecera de un grupo vacío).
  const verInicio       = can(user, 'inicio', 'ver')
  const verReportes     = can(user, 'reportes', 'ver')
  const verKpis         = can(user, 'kpis', 'ver')
  const verDotacion     = can(user, 'dotacion', 'ver')
  const verOrganigrama  = can(user, 'organigrama', 'ver')
  const verPou          = can(user, 'pou', 'ver')
  const verPersonas     = can(user, 'personas', 'ver')
  const verBajas        = bajasSubitems.length > 0
  const verRetenciones  = can(user, 'retenciones', 'ver')
  const verCargos       = can(user, CARGOS_VER_PERMISO.modulo, CARGOS_VER_PERMISO.accion)

  const verGestionCargos = cargosGestionSubitems.length > 0
  const verConcursosCph  = can(user, 'concursos-cph', 'ver')
  const verConcursosCeetps = can(user, 'concursos-ceetps', 'ver')
  const verIncidencias   = can(user, 'incidencias', 'ver')

  const verImportacion   = importacionSubitems.length > 0
  const verConfiguracion = configuracionSubitems.length > 0

  // Un grupo es visible si al menos uno de sus ítems lo es.
  const grupoVisualizacion = verInicio || verReportes || verKpis || verDotacion || verOrganigrama || verPou || verPersonas || verBajas || verRetenciones || verCargos
  const grupoGestion       = verGestionCargos || verConcursosCph || verConcursosCeetps || verIncidencias
  const grupoVistaAdmin    = verImportacion || verConfiguracion

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'}`

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

        {/* Nav — 3 grupos nombrados: VISUALIZACIÓN / GESTIÓN / VISTA ADMIN.
            Cada grupo tiene una cabecera (GroupHeader) y se oculta entero si el
            rol no tiene ningún ítem visible de ese grupo. */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">

          {/* ── VISUALIZACIÓN ─────────────────────────────────────────────── */}
          {grupoVisualizacion && <GroupHeader titulo="Visualización" collapsed={collapsed} />}

          {/* Inicio */}
          {verInicio && (
            <NavLink to="/" end className={itemClass} title={collapsed ? 'Inicio' : undefined}>
              <span className="text-base shrink-0">🏠</span>
              {!collapsed && <span className="truncate">Inicio</span>}
            </NavLink>
          )}

          {/* Reportes */}
          {verReportes && (
            <NavLink to="/reportes" className={itemClass} title={collapsed ? 'Reportes' : undefined}>
              <span className="text-base shrink-0">📈</span>
              {!collapsed && <span className="truncate">Reportes</span>}
            </NavLink>
          )}

          {/* KPIs */}
          {verKpis && (
            <NavLink to="/kpis" className={itemClass} title={collapsed ? 'Tablero KPIs' : undefined}>
              <span className="text-base shrink-0">📊</span>
              {!collapsed && <span className="truncate">Tablero KPIs</span>}
            </NavLink>
          )}

          {/* Dotación */}
          {verDotacion && (
            <NavLink to="/dotacion" className={itemClass} title={collapsed ? 'Dotación' : undefined}>
              <span className="text-base shrink-0">🩺</span>
              {!collapsed && <span className="truncate">Dotación</span>}
            </NavLink>
          )}

          {/* Organigrama — GATE NUEVO (organigrama/ver). "Área Programática"
              (S23-7) vive adentro como pestaña del módulo (OrganigramaLayout). */}
          {verOrganigrama && (
            <NavLink to="/organigrama" className={itemClass} title={collapsed ? 'Organigrama' : undefined}>
              <span className="text-base shrink-0">🏢</span>
              {!collapsed && <span className="truncate">Organigrama</span>}
            </NavLink>
          )}

          {/* POU — GATE NUEVO (pou/ver) */}
          {verPou && (
            <NavLink to="/pou" end className={itemClass} title={collapsed ? 'POU' : undefined}>
              <span className="text-base shrink-0">🧮</span>
              {!collapsed && <span className="truncate">POU</span>}
            </NavLink>
          )}

          {/* Personas */}
          {verPersonas && (
            <NavLink to="/personas" className={itemClass} title={collapsed ? 'Personas' : undefined}>
              <span className="text-base shrink-0">👤</span>
              {!collapsed && <span className="truncate">Personas</span>}
            </NavLink>
          )}

          {/* Bajas — página con pestañas internas (Bajas / Validación / Vinculaciones).
              Visible si el usuario ve al menos una pestaña; el link va a la primera
              pestaña visible (mismo patrón que Importación). */}
          {verBajas && (
            <NavLink to={bajasSubitems[0].to} end
              className={() => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${
                location.pathname.startsWith('/bajas') ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? 'Bajas' : undefined}>
              <span className="text-base shrink-0">🗑️</span>
              {!collapsed && <span className="truncate">Bajas</span>}
            </NavLink>
          )}

          {/* Retenciones (Sprint 18) — pestañas Validación / Retenciones.
              Visible con permiso de lectura (ver): admin/sgrasv/editor. */}
          {verRetenciones && (
            <NavLink to="/retenciones/validacion" className={itemClass} title={collapsed ? 'Retenciones' : undefined}>
              <span className="text-base shrink-0">🔁</span>
              {!collapsed && <span className="truncate">Retenciones</span>}
            </NavLink>
          )}

          {/* Cargos (VISTA) — SOLO consulta (cargos/tab:ver-cargos → /cargos).
              La gestión vive en "Gestión de Cargos" (grupo Gestión). */}
          {verCargos && (
            <NavLink to="/cargos" end
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${
                location.pathname === '/cargos' || isActive ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? 'Cargos' : undefined}>
              <span className="text-base shrink-0">🗂️</span>
              {!collapsed && <span className="truncate">Cargos</span>}
            </NavLink>
          )}

          {/* ── GESTIÓN ───────────────────────────────────────────────────── */}
          {grupoGestion && <GroupHeader titulo="Gestión" collapsed={collapsed} />}

          {/* Gestión de Cargos — pestañas de gestión (Alta / Baja / Cobertura).
              Visible si el usuario ve al menos una; el link va a la 1ª pestaña
              visible (patrón subitems[0].to, igual que Bajas/Importación). */}
          {verGestionCargos && (
            <NavLink to={cargosGestionSubitems[0].to}
              className={() => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${
                ['/cargos/alta', '/cargos/baja', '/cargos/alta-por-baja'].some((p) => location.pathname.startsWith(p))
                  ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? 'Gestión de Cargos' : undefined}>
              <span className="text-base shrink-0">🛠️</span>
              {!collapsed && <span className="truncate">Gestión de Cargos</span>}
            </NavLink>
          )}

          {/* Concursos */}
          {verConcursosCph && (
            <NavLink to="/concursos/cph" className={itemClass} title={collapsed ? 'Concursos CPH' : undefined}>
              <span className="text-base shrink-0">⚖️</span>
              {!collapsed && <span className="truncate">Concursos CPH</span>}
            </NavLink>
          )}
          {verConcursosCeetps && (
            <NavLink to="/concursos/ceetps" className={itemClass} title={collapsed ? 'Concursos CEETPS' : undefined}>
              <span className="text-base shrink-0">🏥</span>
              {!collapsed && <span className="truncate">Concursos CEETPS</span>}
            </NavLink>
          )}

          {/* Incidencias — cola de id_sial nuevos pendientes de gestionar
              tras aprobar el padrón (crear cargo / vincular o crear concurso /
              transferencia / sin código). */}
          {verIncidencias && (
            <NavLink to="/incidencias" className={itemClass} title={collapsed ? 'Incidencias' : undefined}>
              <span className="text-base shrink-0">📌</span>
              {!collapsed && <span className="truncate">Incidencias</span>}
            </NavLink>
          )}

          {/* ── VISTA ADMIN ───────────────────────────────────────────────── */}
          {grupoVistaAdmin && <GroupHeader titulo="Vista Admin" collapsed={collapsed} />}

          {/* Importación — página con pestañas (Padrón / Bajas Consolidadas /
              Árbol Organigrama / Carga POU). El link va a la primera pestaña
              que el usuario puede ver. */}
          {verImportacion && (
            <NavLink to={importacionSubitems[0].to}
              className={() => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${
                ['/padron', '/bajas-consolidadas', '/organigrama/arbol', '/pou/carga'].some((p) => location.pathname.startsWith(p))
                  ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? 'Importación' : undefined}>
              <span className="text-base shrink-0">📥</span>
              {!collapsed && <span className="truncate">Importación</span>}
            </NavLink>
          )}

          {/* Configuración — página con pestañas internas. El link va a la primera
              sección que el usuario puede ver (no todos tienen gestionar_usuarios). */}
          {verConfiguracion && (
            <NavLink to={configuracionSubitems[0].to}
              className={() => `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors ${
                location.pathname.startsWith('/configuracion') ? 'bg-primary text-black' : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={collapsed ? 'Configuración' : undefined}>
              <span className="text-base shrink-0">⚙️</span>
              {!collapsed && <span className="truncate">Configuración</span>}
            </NavLink>
          )}

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
            {/* Badge autorizaciones — separado del de notificaciones (S13-B) */}
            {puedeVerAutorizaciones && (
              <Link
                to="/autorizaciones"
                title="Autorizaciones pendientes"
                className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors mr-1"
              >
                <span className="text-white text-lg">🔐</span>
                {autorizacionesPendientes > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {autorizacionesPendientes > 99 ? '99+' : autorizacionesPendientes}
                  </span>
                )}
              </Link>
            )}
            {/* Badge tareas pendientes (sky) — abierto a todos, sin gate de permiso */}
            <Link
              to="/tareas"
              title="Tareas pendientes"
              className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors mr-1"
            >
              <span className="text-white text-lg">📋</span>
              {tareasPendientes > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {tareasPendientes > 99 ? '99+' : tareasPendientes}
                </span>
              )}
            </Link>
            {/* Badge notificaciones */}
            <Link
              to="/notificaciones"
              title="Notificaciones"
              className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/10 transition-colors mr-2"
            >
              <span className="text-white text-lg">🔔</span>
              {noLeidas > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {noLeidas > 99 ? '99+' : noLeidas}
                </span>
              )}
            </Link>
            <div className="h-full bg-primary flex items-center gap-3 px-5">
              <Link to="/perfil" title="Mi perfil" className="text-right hover:opacity-80 transition-opacity">
                <p className="text-xs font-bold text-black leading-tight">{user.username}</p>
                <p className="text-[10px] text-black/70 capitalize">{user.rol.replace(/_/g, ' ')}</p>
              </Link>
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
          {/* Suspense para el lazy-loading de las páginas de módulo (ver
              router.tsx). Envuelve solo el área de contenido: el sidebar y el
              header quedan fijos mientras carga el chunk de la ruta destino. */}
          <Suspense fallback={<SuspenseFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
