import { useState } from 'react'
import { useBajasSialRegistros } from '../hooks/useBajasSial'

const MOT_COLORS: Record<string, string> = {
  'Jubilación Ordinaria':    'bg-blue-50 text-blue-700 border-blue-200',
  'Fallecimiento':           'bg-gray-100 text-gray-600 border-gray-300',
  'Cese de Cargo':           'bg-orange-50 text-orange-700 border-orange-200',
  'Cese':                    'bg-orange-50 text-orange-600 border-orange-200',
  'Renuncia':                'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Jubilación por Invalidez':'bg-purple-50 text-purple-700 border-purple-200',
  'Cesantía':                'bg-red-50 text-red-700 border-red-200',
}

function MotivoBadge({ mot }: { mot: string | null }) {
  if (!mot) return <span className="text-gray-400">—</span>
  const cls = MOT_COLORS[mot] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{mot}</span>
}

const MOTIVOS = Object.keys(MOT_COLORS)

export function BajasPage() {
  const [search, setSearch] = useState('')
  const [motivo, setMotivo] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useBajasSialRegistros({ page, limit: 50, search: search || undefined, motivo: motivo || undefined })

  function handleSearch(v: string) { setSearch(v); setPage(1) }
  function handleMotivo(v: string) { setMotivo(v); setPage(1) }

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-primary text-xl font-bold text-gray-900">Bajas</h2>
          <p className="text-sm text-gray-500 mt-0.5">Histórico de bajas del último archivo SIAL aprobado</p>
        </div>
        {data && (
          <span className="text-xs text-gray-400 self-center">
            {data.meta.total.toLocaleString('es-AR')} registros
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por nombre, CUIL, cargo..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="input-field text-sm w-72"
        />
        <select value={motivo} onChange={(e) => handleMotivo(e.target.value)} className="input-field text-sm">
          <option value="">Todos los motivos</option>
          {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {(search || motivo) && (
          <button onClick={() => { setSearch(''); setMotivo(''); setPage(1) }} className="text-xs text-gray-400 hover:text-gray-600">
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}

        {!isLoading && (!data || data.data.length === 0) && (
          <p className="p-8 text-center text-sm text-gray-400">
            {data ? 'Sin resultados para los filtros aplicados.' : 'No hay ningún archivo de bajas aprobado todavía. Subí uno en Bajas Consolidadas.'}
          </p>
        )}

        {!isLoading && data && data.data.length > 0 && (
          <>
            <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-navy text-white text-left">
                  <tr>
                    {/* Columna fija */}
                    <th className="px-4 py-3 font-semibold sticky left-0 top-0 z-30 bg-navy whitespace-nowrap">Código de cargo</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Id SIAL</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Apellido y Nombre</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">CUIL</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Lit. cód. registro</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Puesto</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Especialidad</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Sigla</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Repartición</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Motivo</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Desde</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Hasta</th>
                    <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Doc. baja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {/* Columna fija */}
                      <td className="px-4 py-3 font-mono text-xs sticky left-0 z-10 bg-white hover:bg-gray-50 whitespace-nowrap border-r border-gray-100">
                        {r.codigo_cargo
                          ? <span className="text-gray-700 font-semibold">{r.codigo_cargo}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{r.cargo}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.ayn}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{r.cuil}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.lit_cod_reg ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.lit_puesto ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.especialidad ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{r.sigla ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.desc_rep ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><MotivoBadge mot={r.mot_baja} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {r.cargo_desde ? new Date(r.cargo_desde).toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {r.cargo_hasta ? new Date(r.cargo_hasta).toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-400 whitespace-nowrap">{r.doc_resp_baja ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Página {data.meta.page} de {data.meta.pages} — {data.meta.total.toLocaleString('es-AR')} en total</span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={page >= data.meta.pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
