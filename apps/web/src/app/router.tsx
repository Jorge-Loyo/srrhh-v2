import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../shared/components/layout/AppShell'
import { LoginPage } from '../modules/auth/pages/LoginPage'
import { ProtectedRoute } from '../modules/auth/components/ProtectedRoute'
import { RequirePermiso } from '../modules/auth/components/RequirePermiso'
import { useAuth } from '../modules/auth/hooks/useAuth'
import { can } from '../shared/lib/can'
import { AdminUsuariosPage } from '../modules/usuarios/pages/AdminUsuariosPage'
import { ConfiguracionPermisosPage } from '../modules/configuracion/pages/ConfiguracionPermisosPage'
import { ConfiguracionJerarquiaPage } from '../modules/configuracion/pages/ConfiguracionJerarquiaPage'
import { ConfiguracionReferenciasPage } from '../modules/configuracion/pages/ConfiguracionReferenciasPage'
import { OrganigramaHomePage } from '../modules/organigrama/pages/OrganigramaHomePage'
import { OrganigramaDetallePage } from '../modules/organigrama/pages/OrganigramaDetallePage'
import { OrganigramaArbolPage } from '../modules/organigrama/pages/OrganigramaArbolPage'
import { PouHomePage } from '../modules/pou/pages/PouHomePage'
import { PouDetallePage } from '../modules/pou/pages/PouDetallePage'
import { PouComparativaPage } from '../modules/pou/pages/PouComparativaPage'
import { PouCargaPage } from '../modules/pou/pages/PouCargaPage'
import { PouTriangulacionPage } from '../modules/pou/pages/PouTriangulacionPage'
import { InicioPage } from '../modules/inicio/pages/InicioPage'
import { PadronPage } from '../modules/padron/pages/PadronPage'
import { PadronDiffPage } from '../modules/padron/pages/PadronDiffPage'
import { PersonasPage } from '../modules/personas/pages/PersonasPage'
import { DotacionPage } from '../modules/dotacion/pages/DotacionPage'
import { TokensPage } from '../modules/tokens/pages/TokensPage'
import { AuditoriaPage } from '../modules/auditoria/pages/AuditoriaPage'
import { PersonaDetailPanel } from '../modules/personas/pages/PersonaDetailPanel'
import { CargosPage } from '../modules/cargos/pages/CargosPage'
import { CargoDetailPanel } from '../modules/cargos/pages/CargoDetailPanel'
import { AltaCargosPage } from '../modules/cargos/pages/AltaCargosPage'
import { AltaPorBajaPage } from '../modules/cargos/pages/AltaPorBajaPage'
import { BajaCargosPage } from '../modules/cargos/pages/BajaCargosPage'
import { NuevaBajaPage } from '../modules/cargos/pages/NuevaBajaPage'
import { ConcursosCphPage } from '../modules/concursos-cph/pages/ConcursosCphPage'
import { ConcursoCphWizard } from '../modules/concursos-cph/pages/ConcursoCphWizard'
import { ConcursosCeetpsPage } from '../modules/concursos-ceetps/pages/ConcursosCeetpsPage'
import { ConcursoCeetpsDetail } from '../modules/concursos-ceetps/pages/ConcursoCeetpsDetail'
import { KpisPage } from '../modules/kpis/pages/KpisPage'
import { BajasPage } from '../modules/bajas/pages/BajasPage'
import { BajasConsolidasPage } from '../modules/bajas/pages/BajasConsolidasPage'
import { BajasSialDiffPage } from '../modules/bajas/pages/BajasSialDiffPage'
import { ValidacionYVinculacionPage } from '../modules/bajas/pages/ValidacionYVinculacionPage'
import { ValidacionRetencionesPage } from '../modules/retenciones/pages/ValidacionRetencionesPage'
import { NotificacionesPage } from '../modules/notificaciones/pages/NotificacionesPage'
import { AutorizacionesPage } from '../modules/autorizaciones/pages/AutorizacionesPage'

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
          { path: 'padron', element: <PadronPage /> },
          { path: 'padron/:snapshotId', element: <PadronDiffPage /> },
          { path: 'personas', element: <PersonasPage /> },
          { path: 'personas/:id', element: <PersonaDetailPanel /> },
          {
            element: <RequirePermiso permiso={{ modulo: 'dotacion', accion: 'ver' }} />,
            children: [{ path: 'dotacion', element: <DotacionPage /> }],
          },
          { path: 'organigrama', element: <OrganigramaHomePage /> },
          { path: 'organigrama/seccion/:seccion', element: <OrganigramaDetallePage /> },
          { path: 'organigrama/:code', element: <OrganigramaDetallePage /> },
          { path: 'pou', element: <PouHomePage /> },
          { path: 'pou/comparativa', element: <PouComparativaPage /> },
          { path: 'pou/triangulacion', element: <PouTriangulacionPage /> },
          { path: 'pou/:sigla', element: <PouDetallePage /> },
          { path: 'cargos', element: <CargosPage /> },
          { path: 'cargos/:id', element: <CargoDetailPanel /> },
          { path: 'cargos/alta', element: <AltaCargosPage /> },
          { path: 'cargos/baja', element: <BajaCargosPage /> },
          { path: 'cargos/baja/nueva', element: <NuevaBajaPage /> },
          { path: 'cargos/baja/:bajaId/editar', element: <NuevaBajaPage /> },
          { path: 'cargos/alta-por-baja', element: <AltaPorBajaPage /> },
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
          { path: 'bajas', element: <BajasPage /> },
          { path: 'bajas/validacion', element: <ValidacionYVinculacionPage /> },
          {
            // Compat: la antigua entrada de menú "Vinculación de Bajas" ahora es
            // una pestaña dentro de /bajas/validacion.
            path: 'bajas/vinculacion',
            element: <Navigate to="/bajas/validacion" replace />,
          },
          { path: 'retenciones/validacion', element: <ValidacionRetencionesPage /> },
          { path: 'notificaciones', element: <NotificacionesPage /> },
          {
            element: <RequirePermiso permiso={{ modulo: 'autorizaciones', accion: 'ver' }} />,
            children: [{ path: 'autorizaciones', element: <AutorizacionesPage /> }],
          },
          { path: 'bajas-consolidadas', element: <BajasConsolidasPage /> },
          { path: 'bajas-consolidadas/:snapshotId', element: <BajasSialDiffPage /> },
          {
            element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_organigrama' }} />,
            children: [{ path: 'organigrama/arbol', element: <OrganigramaArbolPage /> }],
          },
          {
            element: <RequirePermiso permiso={{ modulo: 'configuracion', accion: 'gestionar_pou' }} />,
            children: [{ path: 'pou/carga', element: <PouCargaPage /> }],
          },
          { path: 'kpis', element: <KpisPage /> },
          // Ruta vieja (pre-RBAC dinámico) — redirect por si alguien la tiene
          // guardada en favoritos; el destino real ya vive bajo /configuracion.
          { path: 'admin/usuarios', element: <Navigate to="/configuracion/usuarios" replace /> },
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
  { path: '/login', element: <LoginPage /> },
])
