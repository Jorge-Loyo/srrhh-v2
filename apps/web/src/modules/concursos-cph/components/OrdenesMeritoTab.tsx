// Pestaña "Órdenes de mérito" de la página de concursos CPH. Lista las órdenes
// de mérito vigentes (6 meses o hasta designar/anular a todos sus integrantes)
// con los integrantes que siguen disponibles. (Fase 5 completa la implementación.)
export function OrdenesMeritoTab() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="font-primary text-lg font-bold text-gray-900 mb-1">
        Órdenes de mérito vigentes
      </h2>
      <p className="text-sm text-gray-500">
        Órdenes de mérito confirmadas y vigentes, con los integrantes disponibles para reutilizar en
        concursos del mismo puesto, especialidad y escalafón.
      </p>
      <p className="mt-6 text-sm text-gray-400">Cargando… (pendiente Fase 5)</p>
    </div>
  )
}
