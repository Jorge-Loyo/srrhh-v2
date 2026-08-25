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

// Páginas placeholder — se implementan en cada sprint
const Placeholder = ({ title }: { title: string }) => (
  <div className="bg-white rounded-lg shadow-sm p-8 text-center">
    <h2 className="font-primary text-xl font-bold text-gray-700 mb-2">{title}</h2>
    <p className="text-sm text-gray-400">Módulo en desarrollo</p>
  </div>
)

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
          // S3-9: el panel de detalle todavía no existe — placeholder hasta
          // la próxima tarea. La tabla de arriba ya navega acá al hacer clic.
          { path: 'cargos/:id', element: <Placeholder title="Detalle Cargo" /> },
          { path: 'concursos/cph', element: <Placeholder title="Concursos CPH" /> },
          { path: 'concursos/cph/:id', element: <Placeholder title="Detalle Concurso CPH" /> },
          { path: 'concursos/ceetps', element: <Placeholder title="Concursos CEETPS" /> },
          { path: 'kpis', element: <Placeholder title="Tablero KPIs" /> },
          { path: 'admin/usuarios', element: <AdminUsuariosPage /> },
        ],
      },
    ],
  },
  { path: '/login', element: <LoginPage /> },
])
