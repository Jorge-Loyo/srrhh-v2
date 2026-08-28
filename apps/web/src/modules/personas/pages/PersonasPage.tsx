import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { PaginatedResponse, PersonaListItem, PersonaFilters } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { downloadExcel, fetchAllPages } from '@/shared/lib/exportExcel'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { usePersonas, usePuestos } from '../hooks/usePersonas'

const LIMIT = 50

export function PersonasPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const search       = searchParams.get('search') ?? ''
  const hospitalId   = searchParams.get('hospitalId') ?? ''
  const escalafonId  = searchParams.get('escalafonId') ?? ''
  const activo       = (searchParams.get('activo') ?? '') as '' | 'true' | 'false'
  const puesto       = searchParams.get('puesto') ?? ''
  const especialidad = searchParams.get('especialidad') ?? ''
  const page         = Number(searchParams.get('page') ?? '1')

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function setPage(p: number | ((prev: number) => number)) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const newPage = typeof p === 'function' ? p(Number(prev.get('page') ?? '1')) : p
      if (newPage === 1) next.delete('page'); else next.set('page', String(newPage))
      return next
    }, { replace: true })
  }

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

  function cambiarPuesto(nuevoPuesto: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nuevoPuesto) next.set('puesto', nuevoPuesto); else next.delete('puesto')
      next.delete('especialidad')
      next.delete('page')
      return next
    })
  }

  function cambiarEscalafon(nuevoEscalafonId: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nuevoEscalafonId) next.set('escalafonId', nuevoEscalafonId); else next.delete('escalafonId')
      next.delete('puesto')
      next.delete('especialidad')
      next.delete('page')
      return next
    })
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
            onChange={(e) => setParam('search', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <select
            value={hospitalId}
            onChange={(e) => setParam('hospitalId', e.target.value)}
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
            onChange={(e) => setParam('activo', e.target.value)}
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
          {puesto && especialidadesDelPuesto.length > 0 && (
            <select
              value={especialidad}
              onChange={(e) => setParam('especialidad', e.target.value)}
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

        {/* Burbujas de filtros activos */}
        {(() => {
          const chips: { label: string; key: string }[] = []
          if (search) chips.push({ label: `"${search}"`, key: 'search' })
          if (hospitalId) {
            const h = hospitales?.find((h) => h.id === hospitalId)
            chips.push({ label: h?.sigla ?? hospitalId, key: 'hospitalId' })
          }
          if (escalafonId) {
            const e = escalafones?.find((e) => e.id === escalafonId)
            chips.push({ label: e ? escalafonLabel(e.nombre) : escalafonId, key: 'escalafonId' })
          }
          if (activo) chips.push({ label: activo === 'true' ? 'Solo activos' : 'Solo inactivos', key: 'activo' })
          if (puesto) chips.push({ label: puesto, key: 'puesto' })
          if (especialidad) chips.push({ label: especialidad, key: 'especialidad' })
          if (chips.length === 0) return null
          return (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium">
                  {chip.label}
                  <button
                    onClick={() => {
                      if (chip.key === 'escalafonId') cambiarEscalafon('')
                      else if (chip.key === 'puesto') cambiarPuesto('')
                      else setParam(chip.key, '')
                    }}
                    className="ml-0.5 hover:text-secondary/60"
                    aria-label={`Quitar filtro ${chip.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {chips.length > 1 && (
                <button
                  onClick={() => setSearchParams({})}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Limpiar todo
                </button>
              )}
            </div>
          )
        })()}
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
                <thead className="bg-navy text-white text-left">
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
                        <Link to={`/personas/${p.id}`} state={{ from: searchParams.toString() }} className="btn-outline">
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
