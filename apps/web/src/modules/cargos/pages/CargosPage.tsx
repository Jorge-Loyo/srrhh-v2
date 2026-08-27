import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EstadoCargo } from '@srrhh/types'
import type { Cargo, CargoFilters, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { downloadExcel, fetchAllPages } from '@/shared/lib/exportExcel'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { useCargos } from '../hooks/useCargos'

const LIMIT = 50

const ESTADO_LABEL: Record<EstadoCargo, string> = {
  [EstadoCargo.VIGENTE]: 'Vigente',
  [EstadoCargo.NO_VIGENTE]: 'No vigente',
}

export function CargosPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const search      = searchParams.get('search') ?? ''
  const hospitalId  = searchParams.get('hospitalId') ?? ''
  const escalafonId = searchParams.get('escalafonId') ?? ''
  const estado      = (searchParams.get('estado') ?? '') as '' | EstadoCargo
  const ocupado     = (searchParams.get('ocupado') ?? '') as '' | 'true' | 'false'
  const page        = Number(searchParams.get('page') ?? '1')

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

  const searchDebounced = useDebounce(search, 300)

  const filters: CargoFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(estado && { estado }),
    ...(ocupado && { ocupado: ocupado === 'true' }),
  }

  const { data, isLoading, isFetching, isError } = useCargos(filters)
  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()

  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )

  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState(false)

  async function handleExport() {
    setExportando(true)
    setExportError(false)
    try {
      const { page: _page, limit: _limit, ...filtrosSinPaginado } = filters
      const cargos = await fetchAllPages<Cargo>((p, l) =>
        apiClient
          .get<PaginatedResponse<Cargo>>('/api/v1/cargos', { params: { ...filtrosSinPaginado, page: p, limit: l } })
          .then((r) => r.data)
      )
      downloadExcel(
        `cargos_${new Date().toISOString().slice(0, 10)}.xlsx`,
        cargos.map((c) => ({
          'Código Cargo': c.codigo ?? '',
          Puesto: c.literalPuesto ?? '',
          Especialidad: c.especialidad ?? '',
          Agrupador: c.agrupador ?? '',
          'Unificador de Puesto': c.unificadorPuesto ?? '',
          Hospital: c.hospital?.sigla ?? '',
          Escalafón: c.escalafon?.nombre ?? '',
          Régimen: c.regimen ?? '',
          Estado: ESTADO_LABEL[c.estado],
          Ocupación: c.ocupado ? 'Ocupado' : 'Vacante',
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
          <h1 className="font-primary text-xl font-bold text-gray-900">Cargos</h1>
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
            placeholder="Buscar por código de cargo, puesto, especialidad..."
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
              <option key={h.id} value={h.id}>{h.sigla}</option>
            ))}
          </select>
          <select
            value={escalafonId}
            onChange={(e) => setParam('escalafonId', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los escalafones</option>
            {escalafonesOrdenados.map((e) => (
              <option key={e.id} value={e.id}>{escalafonLabel(e.nombre)}</option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => setParam('estado', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los estados</option>
            <option value={EstadoCargo.VIGENTE}>Vigente</option>
            <option value={EstadoCargo.NO_VIGENTE}>No vigente</option>
          </select>
          <select
            value={ocupado}
            onChange={(e) => setParam('ocupado', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Ocupados y vacantes</option>
            <option value="true">Solo ocupados</option>
            <option value="false">Solo vacantes</option>
          </select>
        </div>

        {/* Chips de filtros activos */}
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
          if (estado) chips.push({ label: ESTADO_LABEL[estado as EstadoCargo], key: 'estado' })
          if (ocupado) chips.push({ label: ocupado === 'true' ? 'Solo ocupados' : 'Solo vacantes', key: 'ocupado' })
          if (chips.length === 0) return null
          return (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium">
                  {chip.label}
                  <button
                    onClick={() => setParam(chip.key, '')}
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
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando cargos...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de cargos.</p>}

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
                    <th className="px-4 py-3 font-semibold">Código Cargo</th>
                    <th className="px-4 py-3 font-semibold">Hospital</th>
                    <th className="px-4 py-3 font-semibold">Escalafón</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Ocupación</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{c.codigo ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.escalafon?.nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.literalPuesto ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={c.estado === EstadoCargo.VIGENTE ? 'badge-success' : 'badge-default'}>
                          {ESTADO_LABEL[c.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={c.ocupado ? 'badge-success' : 'badge-warning'}>
                          {c.ocupado ? 'Ocupado' : 'Vacante'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/cargos/${c.id}`} state={{ from: searchParams.toString() }} className="btn-outline">
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
