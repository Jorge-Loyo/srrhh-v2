import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../shared/components/layout/AppShell'
import { LoginPage } from '../modules/auth/pages/LoginPage'
import { ProtectedRoute } from '../modules/auth/components/ProtectedRoute'
import { AdminUsuariosPage } from '../modules/usuarios/pages/AdminUsuariosPage'
import { PadronDiffPage } from '../modules/padron/pages/PadronDiffPage'

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
          { path: 'padron', element: <Placeholder title="Padrón Semanal" /> },
          // S2-10: la entrada real (lista de snapshots -> click -> acá) llega
          // con S2-9, todavía bloqueada por S2-18. Mientras tanto la página
          // es alcanzable directo por URL para poder construirla y probarla.
          { path: 'padron/:snapshotId', element: <PadronDiffPage /> },
          { path: 'personas', element: <Placeholder title="Personas" /> },
          { path: 'personas/:id', element: <Placeholder title="Detalle Persona" /> },
          { path: 'cargos', element: <Placeholder title="Cargos" /> },
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
