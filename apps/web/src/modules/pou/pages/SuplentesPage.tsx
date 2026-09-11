import { useMemo, useState } from 'react'
import { useSuplentes } from '../hooks/usePou'

export function SuplentesPage() {
  const { data = [], isLoading } = useSuplentes()
  const [search, setSearch] = useState('')

  const filas = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter(
      (r) =>
        r.sigla.toLowerCase().includes(q) ||
        r.codigo.toLowerCase().includes(q) ||
        (r.especialidadLegacy ?? '').toLowerCase().includes(q)
    )
  }, [data, search])

  const porHospital = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of data) counts[r.sigla] = (counts[r.sigla] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [data])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔄</span>
          <h1 className="text-lg font-bold text-gray-900">Suplentes de Guardia en Concurso</h1>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Cargos suplentes de guardia con concurso abierto — universo separado del POU.
          Total: <span className="font-semibold text-gray-800">{data.length}</span> cargos en {porHospital.length} hospitales.
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por sigla, código o especialidad..."
          className="form-input text-sm py-1.5 w-full sm:w-80"
        />
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Cargando...</p>
        ) : filas.length === 0 ? (
          <p className="text-center py-10 text-gray-400">Sin resultados</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {['Sigla', 'Código', 'Especialidad', 'Tipo Concurso', 'Fecha Vacante'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.codigo} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs font-bold text-primary-700">{r.sigla}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="px-3 py-2 text-xs">{r.especialidadLegacy ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.tipoConcurso}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{r.fechaVacante?.slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
