// Vacío por ahora — el desglose por fichas que vivía acá se movió a la
// pantalla Dotación (panel "Fichas"), aplicado sobre sus propios filtros y su
// propia tabla en vez de duplicarlos. Se conserva la ruta/permiso
// (reportes:ver) por si se suma contenido nuevo más adelante.
export function ReportesPage() {
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h1 className="font-primary text-xl font-bold text-gray-900">Reportes</h1>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">Todavía no hay nada acá.</p>
      </div>
    </div>
  )
}
