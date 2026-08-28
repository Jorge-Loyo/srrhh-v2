import { useState } from 'react'

type TipoProceso = 'Baja' | 'Concurso'

interface ProcesoBaja {
  id: number
  tipo: TipoProceso
  fecha: string
  codigoCargo: string
  puesto: string
  hospital: string
  persona?: string
  motivo?: string
  estado: string
}

const MOCK_PROCESOS: ProcesoBaja[] = [
  { id: 9, tipo: 'Concurso', fecha: '2025-07-15', codigoCargo: 'CPH-POF-011234', puesto: 'Médico de Planta', hospital: 'HGAIP', estado: 'En curso' },
  { id: 8, tipo: 'Baja', fecha: '2025-07-10', codigoCargo: 'CPH-POF-011234', puesto: 'Médico de Planta', hospital: 'HGAIP', persona: 'García, Luis', motivo: 'Jubilación', estado: 'Registrada' },
  { id: 7, tipo: 'Concurso', fecha: '2025-06-20', codigoCargo: 'CPH-ENF-005678', puesto: 'Enfermero/a', hospital: 'HGATA', estado: 'Cerrado' },
  { id: 6, tipo: 'Baja', fecha: '2025-06-18', codigoCargo: 'CPH-ENF-005678', puesto: 'Enfermero/a', hospital: 'HGATA', persona: 'Rodríguez, Ana', motivo: 'Renuncia', estado: 'Registrada' },
  { id: 5, tipo: 'Baja', fecha: '2025-05-03', codigoCargo: 'CPH-ADM-009012', puesto: 'Administrativo', hospital: 'CSMA', persona: 'López, Carlos', motivo: 'Fallecimiento', estado: 'Registrada' },
  { id: 4, tipo: 'Concurso', fecha: '2025-04-11', codigoCargo: 'CPH-POF-003456', puesto: 'Jefe de Servicio', hospital: 'HGACD', estado: 'Cerrado' },
  { id: 3, tipo: 'Baja', fecha: '2025-04-08', codigoCargo: 'CPH-POF-003456', puesto: 'Jefe de Servicio', hospital: 'HGACD', persona: 'Martínez, Roberto', motivo: 'Jubilación', estado: 'Registrada' },
  { id: 2, tipo: 'Baja', fecha: '2025-02-14', codigoCargo: 'CPH-TEC-007890', puesto: 'Técnico Radiólogo', hospital: 'HGAIP', persona: 'Fernández, María', motivo: 'Renuncia', estado: 'Registrada' },
  { id: 1, tipo: 'Concurso', fecha: '2025-01-20', codigoCargo: 'CPH-POF-001122', puesto: 'Director', hospital: 'HGATA', estado: 'Cerrado' },
]

const ESTADO_CLASSES: Record<string, string> = {
  'Registrada': 'badge-default',
  'En curso':   'badge-warning',
  'Cerrado':    'badge-success',
}

export function AltaPorBajaPage() {
  const [search, setSearch] = useState('')

  const filtrados = MOCK_PROCESOS.filter((p) => {
    const q = search.toLowerCase()
    return (
      !q ||
      p.codigoCargo.toLowerCase().includes(q) ||
      p.puesto.toLowerCase().includes(q) ||
      p.hospital.toLowerCase().includes(q) ||
      (p.persona ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Alta por Baja</h1>
          <div className="flex gap-2">
            <button className="btn-outline">+ Nueva Baja</button>
            <button className="btn-primary">+ Nuevo Concurso</button>
          </div>
        </div>

        <input
          type="text"
          placeholder="Buscar por código de cargo, puesto, hospital, persona..."
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
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Código Cargo</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-4 py-3 font-semibold">Motivo</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.fecha}</td>
                  <td className="px-4 py-3">
                    <span className={p.tipo === 'Baja' ? 'badge-danger' : 'badge-info'}>
                      {p.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.codigoCargo}</td>
                  <td className="px-4 py-3 text-gray-600">{p.puesto}</td>
                  <td className="px-4 py-3 text-gray-600">{p.hospital}</td>
                  <td className="px-4 py-3 text-gray-600">{p.persona ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.motivo ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={ESTADO_CLASSES[p.estado] ?? 'badge-default'}>{p.estado}</span>
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
