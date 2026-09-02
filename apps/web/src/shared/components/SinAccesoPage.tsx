import { Link } from 'react-router-dom'

export function SinAccesoPage() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-8 text-center">
      <h2 className="font-primary text-xl font-bold text-gray-700 mb-2">Sin acceso</h2>
      <p className="text-sm text-gray-400 mb-4">No tenés permiso para ver esta sección.</p>
      <Link to="/" className="text-secondary text-sm font-semibold hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
