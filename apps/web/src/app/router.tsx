import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../shared/components/layout/AppShell'
import { LoginPage } from '../modules/auth/pages/LoginPage'
import { ProtectedRoute } from '../modules/auth/components/ProtectedRoute'
import { AdminUsuariosPage } from '../modules/usuarios/pages/AdminUsuariosPage'
import { PadronPage } from '../modules/padron/pages/PadronPage'
import { PadronDiffPage } from '../modules/padron/pages/PadronDiffPage'
import { PersonasPage } from '../modules/personas/pages/PersonasPage'
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

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/padron" replace /> },
          { path: 'padron', element: <PadronPage /> },
          { path: 'padron/:snapshotId', element: <PadronDiffPage /> },
          { path: 'personas', element: <PersonasPage /> },
          { path: 'personas/:id', element: <PersonaDetailPanel /> },
          { path: 'cargos', element: <CargosPage /> },
          { path: 'cargos/:id', element: <CargoDetailPanel /> },
          { path: 'cargos/alta', element: <AltaCargosPage /> },
          { path: 'cargos/baja', element: <BajaCargosPage /> },
          { path: 'cargos/baja/nueva', element: <NuevaBajaPage /> },
          { path: 'cargos/baja/:bajaId/editar', element: <NuevaBajaPage /> },
          { path: 'cargos/alta-por-baja', element: <AltaPorBajaPage /> },
          { path: 'concursos/cph', element: <ConcursosCphPage /> },
          { path: 'concursos/cph/nuevo/wizard', element: <ConcursoCphWizard /> },
          { path: 'concursos/cph/:id/wizard', element: <ConcursoCphWizard /> },
          { path: 'concursos/ceetps', element: <ConcursosCeetpsPage /> },
          { path: 'concursos/ceetps/:id', element: <ConcursoCeetpsDetail /> },
          { path: 'bajas', element: <BajasPage /> },
          { path: 'bajas-consolidadas', element: <BajasConsolidasPage /> },
          { path: 'bajas-consolidadas/:snapshotId', element: <BajasSialDiffPage /> },
          { path: 'kpis', element: <KpisPage /> },
          { path: 'admin/usuarios', element: <AdminUsuariosPage /> },
        ],
      },
    ],
  },
  { path: '/login', element: <LoginPage /> },
])
