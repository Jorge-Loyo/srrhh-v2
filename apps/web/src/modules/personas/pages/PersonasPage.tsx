import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PersonaFilters } from '@srrhh/types'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { usePersonas } from '../hooks/usePersonas'

const selectClass =
  'h-10 px-3 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary'

export function PersonasPage() {
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 300)

  const [hospitalId, setHospitalId] = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [activo, setActivo] = useState<'' | 'true' | 'false'>('true')
  const [page, setPage] = useState(1)
  const limit = 50

  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()

  const filters: PersonaFilters = {
    page,
    limit,
    ...(search && { search }),
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(activo && { activo: activo === 'true' }),
  }
  const { data, isLoading, isError, isFetching } = usePersonas(filters)

  // Cualquier cambio de filtro vuelve a la página 1 — si no, se puede quedar
  // pidiendo una página que ya no existe para el resultado filtrado.
  function actualizarFiltro(fn: () => void) {
    fn()
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="font-primary text-xl font-bold text-gray-900 mb-4">Personas</h1>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="search">
              Buscar por nombre, CUIL o DNI
            </label>
            <input
              id="search"
              type="text"
              value={searchInput}
              onChange={(e) => actualizarFiltro(() => setSearchInput(e.target.value))}
              placeholder="Ej: Gonzalez, 20-12345678-9..."
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
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="activo">
              Estado
            </label>
            <select
              id="activo"
              value={activo}
              onChange={(e) => actualizarFiltro(() => setActivo(e.target.value as typeof activo))}
              className={selectClass}
            >
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
              <option value="">Todos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400 text-center">Cargando personas...</p>}

        {isError && (
          <p className="p-6 text-sm text-danger text-center">No se pudo cargar el listado de personas.</p>
        )}

        {!isLoading && !isError && data && data.data.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para estos filtros.</p>
        )}

        {!isLoading && !isError && data && data.data.length > 0 && (
          <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''} transition-opacity`}>
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                <th className="px-4 py-3 font-semibold">CUIL</th>
                <th className="px-4 py-3 font-semibold">Documento</th>
                <th className="px-4 py-3 font-semibold">Especialidad</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.data.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/personas/${p.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{p.apellidoNombre}</td>
                  <td className="px-4 py-3 text-gray-600">{p.cuil}</td>
                  <td className="px-4 py-3 text-gray-600">{p.numeroDoc ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.especialidadPrincipal ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={p.activo ? 'badge-success' : 'badge-default'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
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
