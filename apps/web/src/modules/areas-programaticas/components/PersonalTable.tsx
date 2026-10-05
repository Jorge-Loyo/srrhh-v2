import { capitalizar } from '@/shared/lib/utils'
import type { PersonalRow } from '../hooks/useAreasProgramaticas'

// Tabla "Personal en {CeSAC/unidad}" — Nombre, Puesto, Escalafón, mismas
// columnas que el boceto adjunto al sprint. Compartida por CesacDetailPage y
// UnidadFijaDetailPage (S23-7).
export function PersonalTable({ personal }: { personal: PersonalRow[] }) {
  if (personal.length === 0) {
    return <p className="p-6 text-sm text-gray-400">Sin cargos vigentes vinculados.</p>
  }
  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead className="bg-gray-50 text-left text-gray-500">
        <tr>
          <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide">Nombre</th>
          <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide">Puesto</th>
          <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide">Escalafón</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {personal.map((p) => (
          <tr key={p.personaId} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-800">{p.nombreApellido}</td>
            <td className="px-4 py-2.5 text-gray-600">{capitalizar(p.puesto) || '—'}</td>
            <td className="px-4 py-2.5 text-gray-600">{p.escalafon}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
