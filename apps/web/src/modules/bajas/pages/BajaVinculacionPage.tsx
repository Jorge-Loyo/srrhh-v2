import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBajaVinculacion, diasSinVincular, diasSinVincularBadgeClass } from '../hooks/useBajaVinculacion'

type FiltroVinculacion = 'todas' | 'vinculadas' | 'sin_vincular'

export function BajaVinculacionPage() {
  const [search, setSearch] = useState('')
  const [vinculacion, setVinculacion] = useState<FiltroVinculacion>('todas')

  const { data, isLoading } = useBajaVinculacion({ search: search || undefined, vinculacion })

  return (
    <div className="space-y-5">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-primary text-xl font-bold text-gray-900">Estado de vinculación de bajas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Bajas confirmadas por SGRASV y si ya fueron respaldadas por el archivo semanal del padrón
          </p>
        </div>
        {data && <span className="text-xs text-gray-400 self-center">{data.length.toLocaleString('es-AR')} bajas</span>}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por nombre, cargo, hospital..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm w-72"
        />
        <select value={vinculacion} onChange={(e) => setVinculacion(e.target.value as FiltroVinculacion)} className="input-field text-sm">
          <option value="todas">Todas</option>
          <option value="vinculadas">Vinculadas</option>
          <option value="sin_vincular">Sin vincular</option>
        </select>
        {(search || vinculacion !== 'todas') && (
          <button onClick={() => { setSearch(''); setVinculacion('todas') }} className="text-xs text-gray-400 hover:text-gray-600">
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}

        {!isLoading && (!data || data.length === 0) && (
          <p className="p-8 text-center text-sm text-gray-400">Sin resultados para los filtros aplicados.</p>
        )}

        {!isLoading && data && data.length > 0 && (
          <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-navy text-white text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Cargo</th>
                  <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Hospital</th>
                  <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Fecha de baja</th>
                  <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Vinculación</th>
                  <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Archivo vinculado</th>
                  <th className="px-4 py-3 font-semibold sticky top-0 z-20 bg-navy whitespace-nowrap">Concurso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((b) => {
                  const dias = diasSinVincular(b.fechaBaja)
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{b.cargoCodigo ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{b.hospitalNombre}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{b.personaApellidoNombre ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(b.fechaBaja).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {b.padronVinculadoAt ? (
                          <span className="badge-success">Vinculada</span>
                        ) : (
                          <span className={diasSinVincularBadgeClass(dias)}>{dias} días sin vincular</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {b.snapshotVinculado ? b.snapshotVinculado.filename : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {b.concursoId ? (
                          <Link to={`/concursos/cph/${b.concursoId}/wizard`} className="btn-outline">Ver</Link>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
