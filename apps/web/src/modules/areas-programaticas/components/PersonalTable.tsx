import { capitalizar } from '@/shared/lib/utils'
import type { PersonalRow } from '../hooks/useAreasProgramaticas'

// Tabla "Personal en {CeSAC/unidad}" — Nombre y Puesto (literal). No se muestra
// "escalafón": la app se basa en el literal del puesto y el código de registro,
// no en el nombre del escalafón (que agrupa varios cod_registro y confunde).
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
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {personal.map((p) => (
          <tr key={p.personaId} className="hover:bg-gray-50">
            <td className="px-4 py-2.5 text-gray-800">{p.nombreApellido}</td>
            <td className="px-4 py-2.5 text-gray-600">{capitalizar(p.puesto) || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
