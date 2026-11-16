import { KanbanSgrasv } from '../components/KanbanSgrasv'

export function KanbanSgrasvPage() {
  return (
    <div className="max-w-full space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gestión de concursos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Asignación de siglas y kanban de supervisores.</p>
      </div>
      <KanbanSgrasv />
    </div>
  )
}
