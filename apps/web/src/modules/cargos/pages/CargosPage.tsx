import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoCargo } from '@srrhh/types'
import type { CargoFilters } from '@srrhh/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { exportToCsv } from '@/shared/lib/export-csv'
import { useCargos } from '../hooks/useCargos'

const LIMIT = 50

const ESTADO_LABEL: Record<EstadoCargo, string> = {
  [EstadoCargo.VIGENTE]: 'Vigente',
  [EstadoCargo.NO_VIGENTE]: 'No vigente',
}

export function CargosPage() {
  const [search, setSearch] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [estado, setEstado] = useState<'' | EstadoCargo>('')
  const [page, setPage] = useState(1)
  const searchDebounced = useDebounce(search, 300)

  const filters: CargoFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(estado && { estado }),
  }

  const { data, isLoading, isFetching, isError } = useCargos(filters)
  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  // S3-10: igual que en PersonasPage, exporta la página actual — ver
  // comentario ahí sobre por qué no exporta "todo lo filtrado".
  function handleExport() {
    if (!data?.data.length) return
    exportToCsv(
      `cargos_pagina-${page}`,
      [
        { key: 'idSial', label: 'ID SIAL' },
        { key: 'literalPuesto', label: 'Puesto' },
        { key: 'especialidad', label: 'Especialidad' },
        { key: 'estado', label: 'Estado' },
      ],
      data.data.map((c) => ({
        idSial: c.idSial,
        literalPuesto: c.literalPuesto,
        especialidad: c.especialidad,
        estado: ESTADO_LABEL[c.estado],
      }))
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Cargos</h1>
          <button className="btn-outline" onClick={handleExport} disabled={!data?.data.length}>
            Exportar página actual (Excel)
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por ID SIAL, puesto, especialidad..."
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
            onChange={(e) => resetPage(setEscalafonId)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los escalafones</option>
            {escalafones?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => resetPage(setEstado)(e.target.value as '' | EstadoCargo)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los estados</option>
            <option value={EstadoCargo.VIGENTE}>Vigente</option>
            <option value={EstadoCargo.NO_VIGENTE}>No vigente</option>
          </select>
        </div>
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
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ID SIAL</th>
                    <th className="px-4 py-3 font-semibold">Hospital</th>
                    <th className="px-4 py-3 font-semibold">Escalafón</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{c.idSial}</td>
                      <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.escalafon?.nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.literalPuesto ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={c.estado === EstadoCargo.VIGENTE ? 'badge-success' : 'badge-default'}>
                          {ESTADO_LABEL[c.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/cargos/${c.id}`} className="btn-outline">
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
