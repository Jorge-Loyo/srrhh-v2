import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { PaginatedResponse, PersonaListItem, PersonaFilters } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { downloadExcel, fetchAllPages } from '@/shared/lib/exportExcel'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { usePersonas, usePuestos } from '../hooks/usePersonas'

const LIMIT = 50

// Pedido de Jorge (2026-08-26): mostrar "CPH" en vez de "Médicos" en el
// dropdown de escalafón — solo el label visual. El value del <option> sigue
// siendo el id real del escalafón (Escalafon.nombre en la base no cambia,
// el filtro sigue funcionando igual) — esto no toca datos ni el back, es
// puramente cosmético en este dropdown.
function escalafonLabel(nombre: string): string {
  return nombre === 'Médicos' ? 'CPH' : nombre
}

export function PersonasPage() {
  const [search, setSearch] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [activo, setActivo] = useState<'' | 'true' | 'false'>('')
  const [puesto, setPuesto] = useState('')
  const [especialidad, setEspecialidad] = useState('')
  const [page, setPage] = useState(1)

  // S3-6: debounce 300ms — no dispara un fetch por cada tecla.
  const searchDebounced = useDebounce(search, 300)

  const filters: PersonaFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(activo && { activo: activo === 'true' }),
    ...(puesto && { puesto }),
    ...(especialidad && { especialidad }),
  }

  const { data, isLoading, isFetching, isError } = usePersonas(filters)
  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()
  // Pedido de Jorge (2026-08-26): el dropdown de puesto queda en cascada con
  // el escalafón elegido — sin escalafón, trae todos los puestos como antes.
  const { data: puestos } = usePuestos(escalafonId || undefined)

  // Pedido de Jorge (2026-08-26): orden alfabético por el LABEL mostrado
  // (no por Escalafon.nombre crudo) — así "CPH" ordena en la C y no se queda
  // perdido bajo la M de "Médicos".
  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )

  // Filtro de especialidad en cascada: solo tiene sentido con un puesto
  // elegido, y solo si ESE puesto realmente tiene especialidades en los
  // datos reales (la mayoría de los puestos no médicos no tienen ninguna —
  // ver Puesto en packages/types).
  const especialidadesDelPuesto = puestos?.find((p) => p.puesto === puesto)?.especialidades ?? []

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  function cambiarPuesto(nuevoPuesto: string) {
    setPuesto(nuevoPuesto)
    setEspecialidad('') // las especialidades disponibles cambian con el puesto
    setPage(1)
  }

  // Pedido de Jorge (2026-08-26): al cambiar de escalafón, la lista de
  // puestos disponibles cambia (cascada) — el puesto/especialidad elegidos
  // antes ya pueden no existir en el nuevo escalafón, así que se resetean
  // (mismo patrón que cambiarPuesto con especialidad).
  function cambiarEscalafon(nuevoEscalafonId: string) {
    setEscalafonId(nuevoEscalafonId)
    setPuesto('')
    setEspecialidad('')
    setPage(1)
  }

  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState(false)

  // S3-10: exporta TODO el resultado filtrado (no solo la página visible en
  // pantalla) — fetchAllPages pagina en lotes de 1000 contra el mismo
  // endpoint que ya usa la tabla, con los mismos filtros activos (page/limit
  // se excluyen a propósito, fetchAllPages los maneja por su cuenta).
  async function handleExport() {
    setExportando(true)
    setExportError(false)
    try {
      const { page: _page, limit: _limit, ...filtrosSinPaginado } = filters
      const personas = await fetchAllPages<PersonaListItem>((p, l) =>
        apiClient
          .get<PaginatedResponse<PersonaListItem>>('/api/v1/personas', { params: { ...filtrosSinPaginado, page: p, limit: l } })
          .then((r) => r.data)
      )
      downloadExcel(
        `personas_${new Date().toISOString().slice(0, 10)}.xlsx`,
        personas.map((p) => ({
          'Apellido y Nombre': p.apellidoNombre,
          CUIL: p.cuil,
          'Tipo Doc': p.tipoDoc ?? '',
          Documento: p.numeroDoc ?? '',
          Sexo: p.sexo ?? '',
          'Fecha Nacimiento': p.fechaNacimiento ?? '',
          Puesto: p.puesto ?? '',
          'Especialidad Principal': p.especialidadPrincipal ?? '',
          Estado: p.activo ? 'Activo' : 'Inactivo',
        }))
      )
    } catch {
      setExportError(true)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Personas</h1>
          <button className="btn-outline" onClick={handleExport} disabled={exportando}>
            {exportando ? 'Exportando...' : 'Exportar a Excel'}
          </button>
        </div>
        {exportError && (
          <p className="text-sm text-danger">No se pudo generar el archivo. Volvé a intentar en unos segundos.</p>
        )}

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre, CUIL o DNI..."
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <select
            value={hospitalId}
            onChange={(e) => resetPage(setHospitalId)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los hospitales</option>
            {hospitales?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.sigla}
              </option>
            ))}
          </select>
          <select
            value={escalafonId}
            onChange={(e) => cambiarEscalafon(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los escalafones</option>
            {escalafonesOrdenados.map((e) => (
              <option key={e.id} value={e.id}>
                {escalafonLabel(e.nombre)}
              </option>
            ))}
          </select>
          <select
            value={activo}
            onChange={(e) => resetPage(setActivo)(e.target.value as '' | 'true' | 'false')}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Activos e inactivos</option>
            <option value="true">Solo activos</option>
            <option value="false">Solo inactivos</option>
          </select>
          <SearchableSelect
            value={puesto}
            onChange={cambiarPuesto}
            options={puestos?.map((p) => p.puesto) ?? []}
            placeholder="Todos los puestos"
            className="min-w-[240px]"
          />
          {/* Filtro en cascada: solo aparece si hay un puesto elegido y ese
              puesto tiene especialidades reales en los datos (la mayoría de
              los puestos no médicos no tienen ninguna). */}
          {puesto && especialidadesDelPuesto.length > 0 && (
            <select
              value={especialidad}
              onChange={(e) => resetPage(setEspecialidad)(e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Todas las especialidades</option>
              {especialidadesDelPuesto.map((esp) => (
                <option key={esp} value={esp}>
                  {esp}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando personas...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de personas.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">
                Sin resultados para los filtros aplicados.
              </p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                    <th className="px-4 py-3 font-semibold">CUIL</th>
                    <th className="px-4 py-3 font-semibold">Documento</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Especialidad</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{p.apellidoNombre}</td>
                      <td className="px-4 py-3 text-gray-600">{p.cuil}</td>
                      <td className="px-4 py-3 text-gray-600">{p.numeroDoc ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.puesto ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.especialidadPrincipal ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={p.activo ? 'badge-success' : 'badge-default'}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/personas/${p.id}`} className="btn-outline">
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {data.meta.pages > 1 && (
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
          </>
        )}
      </div>
    </div>
  )
}
