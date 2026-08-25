import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EstadoCargo } from '@srrhh/types'
import type { CargoFilters } from '@srrhh/types'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { useCargos } from '../hooks/useCargos'

const selectClass =
  'h-10 px-3 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary'

export function CargosPage() {
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 300)

  const [hospitalId, setHospitalId] = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [estado, setEstado] = useState<'' | EstadoCargo>(EstadoCargo.VIGENTE)
  const [page, setPage] = useState(1)
  const limit = 50

  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()

  const filters: CargoFilters = {
    page,
    limit,
    ...(search && { search }),
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(estado && { estado }),
  }
  const { data, isLoading, isError, isFetching } = useCargos(filters)

  function actualizarFiltro(fn: () => void) {
    fn()
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="font-primary text-xl font-bold text-gray-900 mb-4">Cargos</h1>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="search">
              Buscar por ID SIAL, puesto, especialidad o agrupador
            </label>
            <input
              id="search"
              type="text"
              value={searchInput}
              onChange={(e) => actualizarFiltro(() => setSearchInput(e.target.value))}
              placeholder="Ej: Medico de Planta..."
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="hospital">
              Hospital
            </label>
            <select
              id="hospital"
              value={hospitalId}
              onChange={(e) => actualizarFiltro(() => setHospitalId(e.target.value))}
              className={selectClass}
            >
              <option value="">Todos</option>
              {hospitales?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.sigla}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="escalafon">
              Escalafón
            </label>
            <select
              id="escalafon"
              value={escalafonId}
              onChange={(e) => actualizarFiltro(() => setEscalafonId(e.target.value))}
              className={selectClass}
            >
              <option value="">Todos</option>
              {escalafones?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="estado">
              Estado
            </label>
            <select
              id="estado"
              value={estado}
              onChange={(e) => actualizarFiltro(() => setEstado(e.target.value as typeof estado))}
              className={selectClass}
            >
              <option value={EstadoCargo.VIGENTE}>Vigentes</option>
              <option value={EstadoCargo.NO_VIGENTE}>No vigentes</option>
              <option value="">Todos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400 text-center">Cargando cargos...</p>}

        {isError && (
          <p className="p-6 text-sm text-danger text-center">No se pudo cargar el listado de cargos.</p>
        )}

        {!isLoading && !isError && data && data.data.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para estos filtros.</p>
        )}

        {!isLoading && !isError && data && data.data.length > 0 && (
          <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''} transition-opacity`}>
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">ID SIAL</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Especialidad</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.data.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/cargos/${c.id}`)}
                >
                  <td className="px-4 py-3 text-gray-600">{c.idSial}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.literalPuesto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.especialidad ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.escalafon?.nombre ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={c.estado === EstadoCargo.VIGENTE ? 'badge-success' : 'badge-default'}>
                      {c.estado === EstadoCargo.VIGENTE ? 'Vigente' : 'No vigente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && data.meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>
              Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
            </span>
            <div className="flex gap-2">
              <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </button>
              <button
                className="btn-outline"
                disabled={page >= data.meta.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
