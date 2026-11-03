import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../shared/components/layout/AppShell'
import { LoginPage } from '../modules/auth/pages/LoginPage'
import { ProtectedRoute } from '../modules/auth/components/ProtectedRoute'
import { RequirePermiso } from '../modules/auth/components/RequirePermiso'
import { useAuth } from '../modules/auth/hooks/useAuth'
import { can } from '../shared/lib/can'
import { SuspenseFallback } from '../shared/components/SuspenseFallback'

// Route-based lazy loading: cada página de módulo (y sus dependencias pesadas
// — @xyflow/react en el organigrama, jspdf/xlsx/docx en los exports, etc.) se
// carga solo cuando se navega a su ruta, no en el arranque. Esto saca ~3 MB del
// bundle inicial. El chrome base (AppShell, Login, ProtectedRoute,
// RequirePermiso) queda con import estático para no meter un flash de carga en
// el arranque; el <Suspense> que cubre estas páginas vive en AppShell, envolviendo
// el <Outlet/> del área de contenido.
//
// Las páginas se exportan con nombre (no default), así que el loader adapta
// `{ NombrePage }` a `{ default }`, que es lo que espera React.lazy.
const AdminUsuariosPage = lazy(() => import('../modules/usuarios/pages/AdminUsuariosPage').then((m) => ({ default: m.AdminUsuariosPage })))
const ConfiguracionPermisosPage = lazy(() => import('../modules/configuracion/pages/ConfiguracionPermisosPage').then((m) => ({ default: m.ConfiguracionPermisosPage })))
const ConfiguracionJerarquiaPage = lazy(() => import('../modules/configuracion/pages/ConfiguracionJerarquiaPage').then((m) => ({ default: m.ConfiguracionJerarquiaPage })))
const ConfiguracionReferenciasPage = lazy(() => import('../modules/configuracion/pages/ConfiguracionReferenciasPage').then((m) => ({ default: m.ConfiguracionReferenciasPage })))
const ConfiguracionLayout = lazy(() => import('../modules/configuracion/components/ConfiguracionLayout').then((m) => ({ default: m.ConfiguracionLayout })))
const ImportacionLayout = lazy(() => import('../modules/importacion/components/ImportacionLayout').then((m) => ({ default: m.ImportacionLayout })))
const OrganigramaHomePage = lazy(() => import('../modules/organigrama/pages/OrganigramaHomePage').then((m) => ({ default: m.OrganigramaHomePage })))
const OrganigramaDetallePage = lazy(() => import('../modules/organigrama/pages/OrganigramaDetallePage').then((m) => ({ default: m.OrganigramaDetallePage })))
const OrganigramaArbolPage = lazy(() => import('../modules/organigrama/pages/OrganigramaArbolPage').then((m) => ({ default: m.OrganigramaArbolPage })))
const OrganigramaLayout = lazy(() => import('../modules/organigrama/components/OrganigramaLayout').then((m) => ({ default: m.OrganigramaLayout })))
const PouHomePage = lazy(() => import('../modules/pou/pages/PouHomePage').then((m) => ({ default: m.PouHomePage })))
const PouDetallePage = lazy(() => import('../modules/pou/pages/PouDetallePage').then((m) => ({ default: m.PouDetallePage })))
const PouComparativaPage = lazy(() => import('../modules/pou/pages/PouComparativaPage').then((m) => ({ default: m.PouComparativaPage })))
const PouCargaPage = lazy(() => import('../modules/pou/pages/PouCargaPage').then((m) => ({ default: m.PouCargaPage })))
const PouTriangulacionPage = lazy(() => import('../modules/pou/pages/PouTriangulacionPage').then((m) => ({ default: m.PouTriangulacionPage })))
const InicioPage = lazy(() => import('../modules/inicio/pages/InicioPage').then((m) => ({ default: m.InicioPage })))
const PadronPage = lazy(() => import('../modules/padron/pages/PadronPage').then((m) => ({ default: m.PadronPage })))
const PadronDiffPage = lazy(() => import('../modules/padron/pages/PadronDiffPage').then((m) => ({ default: m.PadronDiffPage })))
const PersonasPage = lazy(() => import('../modules/personas/pages/PersonasPage').then((m) => ({ default: m.PersonasPage })))
const IncidenciasPage = lazy(() => import('../modules/incidencias/pages/IncidenciasPage').then((m) => ({ default: m.IncidenciasPage })))
const DotacionPage = lazy(() => import('../modules/dotacion/pages/DotacionPage').then((m) => ({ default: m.DotacionPage })))
const ReportesPage = lazy(() => import('../modules/reportes/pages/ReportesPage').then((m) => ({ default: m.ReportesPage })))
const TokensPage = lazy(() => import('../modules/tokens/pages/TokensPage').then((m) => ({ default: m.TokensPage })))
const AuditoriaPage = lazy(() => import('../modules/auditoria/pages/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })))
const PersonaDetailPanel = lazy(() => import('../modules/personas/pages/PersonaDetailPanel').then((m) => ({ default: m.PersonaDetailPanel })))
const CargosPage = lazy(() => import('../modules/cargos/pages/CargosPage').then((m) => ({ default: m.CargosPage })))
const CargoDetailPanel = lazy(() => import('../modules/cargos/pages/CargoDetailPanel').then((m) => ({ default: m.CargoDetailPanel })))
const CargosLayout = lazy(() => import('../modules/cargos/components/CargosLayout').then((m) => ({ default: m.CargosLayout })))
const AltaCargosPage = lazy(() => import('../modules/cargos/pages/AltaCargosPage').then((m) => ({ default: m.AltaCargosPage })))
const AltaPorBajaPage = lazy(() => import('../modules/cargos/pages/AltaPorBajaPage').then((m) => ({ default: m.AltaPorBajaPage })))
const BajaCargosPage = lazy(() => import('../modules/cargos/pages/BajaCargosPage').then((m) => ({ default: m.BajaCargosPage })))
const NuevaBajaPage = lazy(() => import('../modules/cargos/pages/NuevaBajaPage').then((m) => ({ default: m.NuevaBajaPage })))
const ConcursosCphPage = lazy(() => import('../modules/concursos-cph/pages/ConcursosCphPage').then((m) => ({ default: m.ConcursosCphPage })))
const ConcursoCphWizard = lazy(() => import('../modules/concursos-cph/pages/ConcursoCphWizard').then((m) => ({ default: m.ConcursoCphWizard })))
const ConcursosCeetpsPage = lazy(() => import('../modules/concursos-ceetps/pages/ConcursosCeetpsPage').then((m) => ({ default: m.ConcursosCeetpsPage })))
const ConcursoCeetpsDetail = lazy(() => import('../modules/concursos-ceetps/pages/ConcursoCeetpsDetail').then((m) => ({ default: m.ConcursoCeetpsDetail })))
const KpisPage = lazy(() => import('../modules/kpis/pages/KpisPage').then((m) => ({ default: m.KpisPage })))
const BajasPage = lazy(() => import('../modules/bajas/pages/BajasPage').then((m) => ({ default: m.BajasPage })))
const BajasConsolidasPage = lazy(() => import('../modules/bajas/pages/BajasConsolidasPage').then((m) => ({ default: m.BajasConsolidasPage })))
const BajasSialDiffPage = lazy(() => import('../modules/bajas/pages/BajasSialDiffPage').then((m) => ({ default: m.BajasSialDiffPage })))
const ValidacionBajasPage = lazy(() => import('../modules/bajas/pages/ValidacionBajasPage').then((m) => ({ default: m.ValidacionBajasPage })))
const BajaVinculacionPage = lazy(() => import('../modules/bajas/pages/BajaVinculacionPage').then((m) => ({ default: m.BajaVinculacionPage })))
const BajasLayout = lazy(() => import('../modules/bajas/components/BajasLayout').then((m) => ({ default: m.BajasLayout })))
const RetencionesPage = lazy(() => import('../modules/retenciones/pages/RetencionesPage').then((m) => ({ default: m.RetencionesPage })))
const NotificacionesPage = lazy(() => import('../modules/notificaciones/pages/NotificacionesPage').then((m) => ({ default: m.NotificacionesPage })))
const AutorizacionesPage = lazy(() => import('../modules/autorizaciones/pages/AutorizacionesPage').then((m) => ({ default: m.AutorizacionesPage })))
const TareasPage = lazy(() => import('../modules/tareas/pages/TareasPage').then((m) => ({ default: m.TareasPage })))
const AreasProgramaticasPage = lazy(() => import('../modules/areas-programaticas/pages/AreasProgramaticasPage').then((m) => ({ default: m.AreasProgramaticasPage })))
const AreaProgramaticaDetailPage = lazy(() => import('../modules/areas-programaticas/pages/AreaProgramaticaDetailPage').then((m) => ({ default: m.AreaProgramaticaDetailPage })))
const CesacDetailPage = lazy(() => import('../modules/areas-programaticas/pages/CesacDetailPage').then((m) => ({ default: m.CesacDetailPage })))
const UnidadFijaDetailPage = lazy(() => import('../modules/areas-programaticas/pages/UnidadFijaDetailPage').then((m) => ({ default: m.UnidadFijaDetailPage })))
const PresentacionPage = lazy(() => import('../modules/presentacion/pages/PresentacionPage').then((m) => ({ default: m.PresentacionPage })))
const PerfilPage = lazy(() => import('../modules/perfil/pages/PerfilPage').then((m) => ({ default: m.PerfilPage })))

// Redirige a /kpis si el usuario no tiene permiso para ver el inicio
function RequireInicio() {
  const { user } = useAuth()
  if (!can(user, 'inicio', 'ver')) return <Navigate to="/kpis" replace />
  return <InicioPage />
}

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <RequireInicio /> },
          // Perfil del propio usuario — sin RequirePermiso (cualquier
          // autenticado accede a su perfil, igual que Organigrama/POU).
          { path: 'perfil', element: <PerfilPage /> },
          // Importación — página con pestañas (Padrón / Bajas Consolidadas /
          // Árbol Organigrama / Carga POU). Cada pestaña conserva su ruta y su
          // guard de permiso propio. Las vistas de detalle (diffs) van fuera.
          {
            element: <ImportacionLayout />,
            children: [
              { path: 'padron', element: <PadronPage /> },
              {
                element: <RequirePermiso permiso={{ modulo: 'bajas-sial', accion: 'aprobar' }} />,
                children: [{ path: 'bajas-consolidadas', element: <BajasConsolidasPage /> }],
              },
              {
                element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_organigrama' }} />,
                children: [{ path: 'organigrama/arbol', element: <OrganigramaArbolPage /> }],
              },
              {
                element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_pou' }} />,
                children: [{ path: 'pou/carga', element: <PouCargaPage /> }],
              },
            ],
          },
          {
            element: <RequirePermiso permiso={{ modulo: 'reportes', accion: 'ver' }} />,
            children: [{ path: 'reportes', element: <ReportesPage /> }],
          },
          { path: 'padron/:snapshotId', element: <PadronDiffPage /> },
          { path: 'personas', element: <PersonasPage /> },
          { path: 'incidencias', element: <IncidenciasPage /> },
          { path: 'personas/:id', element: <PersonaDetailPanel /> },
          {
            element: <RequirePermiso permiso={{ modulo: 'dotacion', accion: 'ver' }} />,
            children: [{ path: 'dotacion', element: <DotacionPage /> }],
          },
          // Organigrama con pestañas sincronizadas con la URL (OrganigramaLayout
          // + Outlet): Estructura / Área Programática. "Área Programática" era
          // un ítem de nav anidado aparte (S23-7) — ahora es una pestaña más
          // acá adentro. Las páginas de detalle (sección, hospital, AP/CeSAC/
          // unidad fija puntual) quedan fuera del layout, sin la barra de
          // pestañas — mismo patrón que CargoDetailPanel respecto de CargosLayout.
          {
            element: <OrganigramaLayout />,
            children: [
              { path: 'organigrama', element: <OrganigramaHomePage /> },
              {
                element: <RequirePermiso permiso={{ modulo: 'dotacion', accion: 'ver' }} />,
                children: [{ path: 'organigrama/areas-programaticas', element: <AreasProgramaticasPage /> }],
              },
            ],
          },
          { path: 'organigrama/seccion/:seccion', element: <OrganigramaDetallePage /> },
          { path: 'organigrama/:code', element: <OrganigramaDetallePage /> },
          {
            element: <RequirePermiso permiso={{ modulo: 'dotacion', accion: 'ver' }} />,
            children: [
              { path: 'organigrama/areas-programaticas/:id', element: <AreaProgramaticaDetailPage /> },
              { path: 'organigrama/cesacs/:id', element: <CesacDetailPage /> },
              { path: 'organigrama/unidades-fijas/:id', element: <UnidadFijaDetailPage /> },
            ],
          },
          { path: 'pou', element: <PouHomePage /> },
          { path: 'pou/comparativa', element: <PouComparativaPage /> },
          { path: 'pou/triangulacion', element: <PouTriangulacionPage /> },
          { path: 'pou/:sigla', element: <PouDetallePage /> },
          // Cargos con pestañas sincronizadas con la URL (CargosLayout + Outlet).
          // Las 4 acciones principales cuelgan del layout; el detalle y los
          // formularios de baja quedan fuera (no llevan la barra de pestañas).
          {
            element: <CargosLayout />,
            children: [
              { path: 'cargos', element: <CargosPage /> },
              { path: 'cargos/alta', element: <AltaCargosPage /> },
              { path: 'cargos/baja', element: <BajaCargosPage /> },
              { path: 'cargos/alta-por-baja', element: <AltaPorBajaPage /> },
            ],
          },
          { path: 'cargos/:id', element: <CargoDetailPanel /> },
          { path: 'cargos/baja/nueva', element: <NuevaBajaPage /> },
          { path: 'cargos/baja/:bajaId/editar', element: <NuevaBajaPage /> },
          { path: 'concursos/cph', element: <ConcursosCphPage /> },
          // S13-A/S13-C: unificado en /autorizaciones — esta ruta pegaba directo a
          // POST /concursos-cph/:id/autorizar, que nunca tocaba la tabla `autorizaciones`
          // y dejaba filas huérfanas en "pendiente" para siempre. Redirect por si
          // alguien la tiene guardada en favoritos.
          { path: 'concursos/cph/autorizaciones', element: <Navigate to="/autorizaciones" replace /> },
          { path: 'concursos/cph/nuevo/wizard', element: <ConcursoCphWizard /> },
          { path: 'concursos/cph/:id/wizard', element: <ConcursoCphWizard /> },
          { path: 'concursos/ceetps', element: <ConcursosCeetpsPage /> },
          { path: 'concursos/ceetps/:id', element: <ConcursoCeetpsDetail /> },
          // Bajas con pestañas sincronizadas con la URL (BajasLayout + Outlet):
          // Bajas / Validación / Vinculaciones. Cada una conserva su ruta.
          {
            element: <BajasLayout />,
            children: [
              { path: 'bajas', element: <BajasPage /> },
              { path: 'bajas/validacion', element: <ValidacionBajasPage /> },
              { path: 'bajas/vinculacion', element: <BajaVinculacionPage /> },
            ],
          },
          { path: 'retenciones/validacion', element: <RetencionesPage /> },
          { path: 'retenciones/vencimientos', element: <RetencionesPage /> },
          { path: 'notificaciones', element: <NotificacionesPage /> },
          {
            element: <RequirePermiso permiso={{ modulo: 'autorizaciones', accion: 'ver' }} />,
            children: [{ path: 'autorizaciones', element: <AutorizacionesPage /> }],
          },
          // Tareas pendientes — sin RequirePermiso (abierto a todos, igual que
          // /perfil). La visibilidad real la resuelve el backend por jerarquía.
          { path: 'tareas', element: <TareasPage /> },
          // Detalle de bajas consolidadas (fuera del layout de Importación).
          { path: 'bajas-consolidadas/:snapshotId', element: <BajasSialDiffPage /> },
          { path: 'kpis', element: <KpisPage /> },
          // Ruta vieja (pre-RBAC dinámico) — redirect por si alguien la tiene
          // guardada en favoritos; el destino real ya vive bajo /configuracion.
          { path: 'admin/usuarios', element: <Navigate to="/configuracion/usuarios" replace /> },
          // Configuración con pestañas sincronizadas con la URL (ConfiguracionLayout
          // + Outlet). Cada sección conserva su ruta y su guard de permiso propio.
          {
            element: <ConfiguracionLayout />,
            children: [
              {
                element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_usuarios' }} />,
                children: [
                  { path: 'configuracion/usuarios', element: <AdminUsuariosPage /> },
                  { path: 'configuracion/tokens', element: <TokensPage /> },
                  { path: 'configuracion/jerarquia', element: <ConfiguracionJerarquiaPage /> },
                ],
              },
              {
                element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_permisos' }} />,
                children: [
                  { path: 'configuracion/referencias', element: <ConfiguracionReferenciasPage /> },
                  { path: 'configuracion/permisos', element: <ConfiguracionPermisosPage /> },
                ],
              },
              {
                element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'ver_auditoria' }} />,
                children: [{ path: 'configuracion/auditoria', element: <AuditoriaPage /> }],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  // Página independiente para el nuevo proyecto de front — pública, sin AppShell
  // ni guard de auth, para tenerla como lienzo en blanco. Al estar fuera del
  // AppShell necesita su propio <Suspense> para el lazy-load de su chunk.
  {
    path: '/presentacion',
    element: (
      <Suspense fallback={<SuspenseFallback />}>
        <PresentacionPage />
      </Suspense>
    ),
  },
])
