import { useState } from 'react'

interface BajaCargo {
  id: number
  fecha: string
  codigoCargo: string
  puesto: string
  hospital: string
  escalafon: string
  motivo: string
  estado: string
}

const MOCK_BAJAS: BajaCargo[] = [
  { id: 9, fecha: '2025-07-22', codigoCargo: 'CPH-POF-019876', puesto: 'Médico de Planta', hospital: 'HGAIP', escalafon: 'Profesional', motivo: 'Reestructuración', estado: 'Confirmada' },
  { id: 8, fecha: '2025-07-10', codigoCargo: 'CPH-POF-011234', puesto: 'Médico de Planta', hospital: 'HGAIP', escalafon: 'Profesional', motivo: 'Jubilación titular', estado: 'Confirmada' },
  { id: 7, fecha: '2025-06-18', codigoCargo: 'CPH-ENF-005678', puesto: 'Enfermero/a', hospital: 'HGATA', escalafon: 'Enfermería', motivo: 'Renuncia titular', estado: 'Confirmada' },
  { id: 6, fecha: '2025-06-01', codigoCargo: 'CPH-TEC-004321', puesto: 'Técnico Radiólogo', hospital: 'HGACD', escalafon: 'Técnico', motivo: 'Reestructuración', estado: 'Pendiente' },
  { id: 5, fecha: '2025-05-03', codigoCargo: 'CPH-ADM-009012', puesto: 'Administrativo', hospital: 'CSMA', escalafon: 'Administrativo', motivo: 'Fallecimiento titular', estado: 'Confirmada' },
  { id: 4, fecha: '2025-04-08', codigoCargo: 'CPH-POF-003456', puesto: 'Jefe de Servicio', hospital: 'HGACD', escalafon: 'Profesional', motivo: 'Jubilación titular', estado: 'Confirmada' },
  { id: 3, fecha: '2025-03-15', codigoCargo: 'CPH-ENF-007654', puesto: 'Enfermero/a', hospital: 'CSMA', escalafon: 'Enfermería', motivo: 'Reestructuración', estado: 'Anulada' },
  { id: 2, fecha: '2025-02-14', codigoCargo: 'CPH-TEC-007890', puesto: 'Técnico Radiólogo', hospital: 'HGAIP', escalafon: 'Técnico', motivo: 'Renuncia titular', estado: 'Confirmada' },
  { id: 1, fecha: '2025-01-09', codigoCargo: 'CPH-ADM-002233', puesto: 'Administrativo', hospital: 'HGATA', escalafon: 'Administrativo', motivo: 'Jubilación titular', estado: 'Confirmada' },
]

const ESTADO_CLASSES: Record<string, string> = {
  'Pendiente':  'badge-warning',
  'Confirmada': 'badge-success',
  'Anulada':    'badge-danger',
}

export function BajaCargosPage() {
  const [search, setSearch] = useState('')

  const filtrados = MOCK_BAJAS.filter((b) => {
    const q = search.toLowerCase()
    return (
      !q ||
      b.codigoCargo.toLowerCase().includes(q) ||
      b.puesto.toLowerCase().includes(q) ||
      b.hospital.toLowerCase().includes(q) ||
      b.escalafon.toLowerCase().includes(q) ||
      b.motivo.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Baja de Cargos</h1>
          <button className="btn-danger">+ Nueva Baja</button>
        </div>

        <input
          type="text"
          placeholder="Buscar por código de cargo, puesto, hospital, escalafón, motivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {filtrados.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para la búsqueda.</p>
        )}

        {filtrados.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Código Cargo</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Motivo</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.fecha}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{b.codigoCargo}</td>
                  <td className="px-4 py-3 text-gray-600">{b.puesto}</td>
                  <td className="px-4 py-3 text-gray-600">{b.hospital}</td>
                  <td className="px-4 py-3 text-gray-600">{b.escalafon}</td>
                  <td className="px-4 py-3 text-gray-600">{b.motivo}</td>
                  <td className="px-4 py-3">
                    <span className={ESTADO_CLASSES[b.estado] ?? 'badge-default'}>{b.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn-outline">Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
