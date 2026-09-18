// Pestaña "Jurados" de la página de concursos CPH. Lista los jurados
// confirmados y vigentes (6 meses desde la fecha de sorteo) que pueden
// reutilizarse en otros concursos. (Fase 2 completa la implementación.)
export function JuradosTab() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="font-primary text-lg font-bold text-gray-900 mb-1">Jurados vigentes</h2>
      <p className="text-sm text-gray-500">
        Jurados confirmados dentro de los últimos 6 meses, disponibles para reutilizar en concursos
        compatibles.
      </p>
      <p className="mt-6 text-sm text-gray-400">Cargando… (pendiente Fase 2)</p>
    </div>
  )
}
