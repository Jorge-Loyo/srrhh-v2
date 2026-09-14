import { useMemo, useState } from 'react'
import { useTriangulacion, type TriangulacionRow } from '../hooks/usePou'
import { useHospitales } from '@/shared/hooks/useCatalogos'

const ESTADOS = ['TODOS', 'CON POU', 'SIN POU'] as const
type FiltroEstado = (typeof ESTADOS)[number]

const BADGE: Record<TriangulacionRow['estadoPou'], string> = {
  'CON POU':       'bg-green-100 text-green-800',
  'SIN POU':       'bg-red-100 text-red-800',
  'SUPLENTE':      'bg-blue-100 text-blue-800',
  'SIN CLASIFICAR':'bg-gray-100 text-gray-600',
}

export function PouTriangulacionPage() {
  const [sigla, setSigla] = useState<string>('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS')
  const { data: hospitales } = useHospitales()
  const { data = [], isLoading } = useTriangulacion(sigla || undefined)

  const resumen = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of data) counts[r.estadoPou] = (counts[r.estadoPou] ?? 0) + 1
    return counts
  }, [data])

  const filas = useMemo(() =>
    filtroEstado === 'TODOS' ? data : data.filter((r) => r.estadoPou === filtroEstado),
    [data, filtroEstado]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔗</span>
          <h1 className="text-lg font-bold text-gray-900">Triangulación POU vs Concursos</h1>
        </div>

        <div className="flex flex-wrap gap-3 mb-3">
          <select
            value={sigla}
            onChange={(e) => setSigla(e.target.value)}
            className="form-input text-sm py-1.5 w-56"
          >
            <option value="">Todos los hospitales</option>
            {(hospitales ?? []).map((h) => (
              <option key={h.sigla} value={h.sigla}>{h.sigla} — {h.nombre}</option>
            ))}
          </select>

          <div className="flex gap-1">
            {ESTADOS.map((e) => (
              <button
                key={e}
                onClick={() => setFiltroEstado(e)}
                className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
                  filtroEstado === e
                    ? 'bg-primary border-primary text-black'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {e} {e !== 'TODOS' && resumen[e] != null ? `(${resumen[e]})` : e === 'TODOS' ? `(${data.length})` : '(0)'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4 text-xs text-gray-500">
          {Object.entries(resumen).map(([estado, count]) => (
            <span key={estado}>
              <span className={`inline-block px-1.5 py-0.5 rounded font-semibold ${BADGE[estado as TriangulacionRow['estadoPou']]}`}>
                {estado}
              </span>{' '}{count}
            </span>
          ))}
        </div>
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
                {['Sigla','Código','Puesto','Agrupador','Especialidad','Fecha Vacante','Perfil POU','Esp. POU','Dot. Total','Activos','Vacantes','Estado'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.codigo} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs font-bold text-primary-700">{r.sigla}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="px-3 py-2 text-xs">{r.unificadorPuesto ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.agrupador ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.especialidadLegacy ?? '—'}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{r.fechaVacante?.slice(0, 10) ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.pouPerfil ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.pouEspecialidad ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-center">{r.dotacionTotal ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-center">{r.pouActivos ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-center">{r.pouVacantes ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${BADGE[r.estadoPou]}`}>
                      {r.estadoPou}
                    </span>
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
