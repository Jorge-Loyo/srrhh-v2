import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiClient } from '@/shared/lib/api-client'
import { downloadExcel, fetchAllPages } from '@/shared/lib/exportExcel'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { DotacionKpisPanel } from '../components/DotacionKpisPanel'
import {
  useDotacion, toDotacionParams,
  type DotacionFilters, type DotacionListResponse, type DotacionRow,
} from '../hooks/useDotacion'

const LIMIT = 50

// Filtros multi-select "libres" (sin catálogo propio, distinct values vienen
// de la propia tabla — ver dotacion.service.ts:getDistinctValues). El de
// escalafón usa useEscalafones() en cambio, tiene catálogo real.
const MULTI_FILTERS: { key: keyof DotacionFilters; label: string }[] = [
  { key: 'unificadorPuesto', label: 'Unificador Puesto' },
  { key: 'especialidad', label: 'Especialidad' },
  { key: 'agrupador', label: 'Agrupamiento' },
  { key: 'literalPuesto', label: 'Puesto' },
  { key: 'sexo', label: 'Sexo' },
  { key: 'situacionRevista', label: 'Situación de Revista' },
  { key: 'reparticion', label: 'Repartición' },
]

const SIGLAS_FILTERS: { key: keyof DotacionFilters; label: string }[] = [
  { key: 'universoTotalizador', label: 'Universo' },
  { key: 'tipoHospital', label: 'Tipo Hospital' },
  { key: 'monovalencia', label: 'Monovalencia' },
]

const COLUMNS: { key: keyof DotacionRow; label: string; sortKey: string }[] = [
  { key: 'codigoCargo', label: 'Cód. Cargo', sortKey: 'codigoCargo' },
  { key: 'nombreApellido', label: 'Apellido y Nombre', sortKey: 'nombreApellido' },
  { key: 'cuil', label: 'CUIL', sortKey: 'cuil' },
  { key: 'sexo', label: 'Sexo', sortKey: 'sexo' },
  { key: 'literalPuesto', label: 'Puesto', sortKey: 'literalPuesto' },
  { key: 'especialidad', label: 'Especialidad', sortKey: 'especialidad' },
  { key: 'unificadorPuesto', label: 'Unificador', sortKey: 'unificadorPuesto' },
  { key: 'agrupador', label: 'Agrupamiento', sortKey: 'agrupador' },
  { key: 'escalafon', label: 'Escalafón', sortKey: 'escalafon' },
  { key: 'situacionRevista', label: 'Situación de Revista', sortKey: 'situacionRevista' },
  { key: 'reparticion', label: 'Repartición', sortKey: 'reparticion' },
  { key: 'sigla', label: 'Hospital', sortKey: 'sigla' },
  { key: 'edad', label: 'Edad', sortKey: 'edad' },
  { key: 'antiguedad', label: 'Antigüedad', sortKey: 'antiguedad' },
]

function getCsv(searchParams: URLSearchParams, key: string): string[] {
  const v = searchParams.get(key)
  return v ? v.split(',').filter(Boolean) : []
}

export function DotacionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tablaAmpliada, setTablaAmpliada] = useState(false)
  const [exportando, setExportando] = useState<'pagina' | 'completo' | null>(null)

  const page = Number(searchParams.get('page') ?? '1')
  const sortBy = searchParams.get('sortBy') ?? undefined
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc' | null) ?? 'asc'
  const sigla = searchParams.get('sigla') ?? ''
  const escalafonId = getCsv(searchParams, 'escalafonId')
  const codigoCargo = searchParams.get('codigoCargo') ?? ''
  const nombreApellido = searchParams.get('nombreApellido') ?? ''
  const cuil = searchParams.get('cuil') ?? ''
  const codigoRol = searchParams.get('codigoRol') ?? ''

  const nombreApellidoDeb = useDebounce(nombreApellido, 300)
  const cuilDeb = useDebounce(cuil, 300)
  const codigoCargoDeb = useDebounce(codigoCargo, 300)
  const codigoRolDeb = useDebounce(codigoRol, 300)

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function setCsvParam(key: string, values: string[]) {
    setParam(key, values.join(','))
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p === 1) next.delete('page'); else next.set('page', String(p))
      return next
    }, { replace: true })
  }

  function handleSort(sortKey: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const curSortBy = prev.get('sortBy')
      const curDir = prev.get('sortDir') ?? 'asc'
      const nextDir = curSortBy === sortKey && curDir === 'asc' ? 'desc' : 'asc'
      next.set('sortBy', sortKey)
      next.set('sortDir', nextDir)
      next.delete('page')
      return next
    })
  }

  const filters: DotacionFilters = {
    page, limit: LIMIT, sortBy, sortDir,
    ...(sigla && { sigla: [sigla] }),
    ...(getCsv(searchParams, 'universoTotalizador').length && { universoTotalizador: getCsv(searchParams, 'universoTotalizador') }),
    ...(getCsv(searchParams, 'tipoHospital').length && { tipoHospital: getCsv(searchParams, 'tipoHospital') }),
    ...(getCsv(searchParams, 'monovalencia').length && { monovalencia: getCsv(searchParams, 'monovalencia') }),
    ...(getCsv(searchParams, 'unificadorPuesto').length && { unificadorPuesto: getCsv(searchParams, 'unificadorPuesto') }),
    ...(getCsv(searchParams, 'especialidad').length && { especialidad: getCsv(searchParams, 'especialidad') }),
    ...(getCsv(searchParams, 'agrupador').length && { agrupador: getCsv(searchParams, 'agrupador') }),
    ...(getCsv(searchParams, 'literalPuesto').length && { literalPuesto: getCsv(searchParams, 'literalPuesto') }),
    ...(escalafonId.length && { escalafonId }),
    ...(getCsv(searchParams, 'sexo').length && { sexo: getCsv(searchParams, 'sexo') }),
    ...(getCsv(searchParams, 'situacionRevista').length && { situacionRevista: getCsv(searchParams, 'situacionRevista') }),
    ...(getCsv(searchParams, 'reparticion').length && { reparticion: getCsv(searchParams, 'reparticion') }),
    ...(codigoCargoDeb && { codigoCargo: codigoCargoDeb }),
    ...(nombreApellidoDeb && { nombreApellido: nombreApellidoDeb }),
    ...(cuilDeb && { cuil: cuilDeb }),
    ...(codigoRolDeb && { codigoRol: codigoRolDeb }),
    ...(searchParams.get('edadMin') && { edadMin: Number(searchParams.get('edadMin')) }),
    ...(searchParams.get('edadMax') && { edadMax: Number(searchParams.get('edadMax')) }),
    ...(searchParams.get('antiguedadMin') && { antiguedadMin: Number(searchParams.get('antiguedadMin')) }),
    ...(searchParams.get('antiguedadMax') && { antiguedadMax: Number(searchParams.get('antiguedadMax')) }),
    ...(searchParams.get('estado') && { estado: searchParams.get('estado') as string }),
  }

  const { data, isLoading, isFetching, isError } = useDotacion(filters)
  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()
  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )

  const hasActiveFilters = Array.from(searchParams.keys()).some((k) => !['page', 'sortBy', 'sortDir'].includes(k))
  const estadoFilter = searchParams.get('estado') ?? ''

  async function handleExport(kind: 'pagina' | 'completo') {
    if (!data) return
    setExportando(kind)
    try {
      const rowsMapper = (rows: DotacionRow[]) => rows.map((r) => ({
        'Cód. Cargo': r.codigoCargo ?? '', 'Apellido y Nombre': r.nombreApellido, CUIL: r.cuil,
        Sexo: r.sexo ?? '', Puesto: r.literalPuesto ?? '', Especialidad: r.especialidad ?? '',
        Unificador: r.unificadorPuesto ?? '', Agrupamiento: r.agrupador ?? '', Escalafón: r.escalafon,
        'Situación de Revista': r.situacionRevista ?? '', Repartición: r.reparticion ?? '', Hospital: r.sigla,
        'Cód. SIAL': r.codigoRol, 'Mail Laboral': r.mailLaboral ?? '', Teléfono: r.telefono ?? '',
        Edad: r.edad ?? '', Antigüedad: r.antiguedad ?? '',
      }))
      const filename = `dotacion_${new Date().toISOString().slice(0, 10)}.xlsx`
      if (kind === 'pagina') {
        downloadExcel(filename, rowsMapper(data.rows))
      } else {
        const { page: _p, limit: _l, ...sinPaginado } = filters
        const rows = await fetchAllPages<DotacionRow>((p, l) =>
          apiClient
            .get<DotacionListResponse>('/api/v1/dotacion', { params: { ...toDotacionParams({ ...sinPaginado, page: p, limit: l }), skipDistinct: 'true' } })
            .then((r) => ({ data: r.data.rows, meta: { total: r.data.total, page: r.data.page, limit: r.data.limit, pages: r.data.pages } }))
        )
        downloadExcel(filename, rowsMapper(rows))
      }
    } finally {
      setExportando(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-primary text-xl font-bold text-gray-900">Dotación</h1>
          <p className="text-xs text-gray-400">{sigla ? `Hospital: ${sigla}` : 'Todos los hospitales'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={() => handleExport('pagina')} disabled={exportando !== null}>
            {exportando === 'pagina' ? 'Exportando...' : 'Exportar página'}
          </button>
          <button className="btn-outline" onClick={() => handleExport('completo')} disabled={exportando !== null}>
            {exportando === 'completo' ? 'Exportando...' : 'Exportar completo'}
          </button>
          <button className="btn-outline" onClick={() => setTablaAmpliada(true)}>Ampliar</button>
        </div>
      </div>

      <DotacionKpisPanel
        sigla={sigla}
        onFilterSigla={(s) => setParam('sigla', s)}
        estado={estadoFilter}
        onFilterEstado={(e) => setParam('estado', e)}
      />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Segmentación de hospitales</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <select
              value={sigla}
              onChange={(e) => setParam('sigla', e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Todos los hospitales</option>
              {hospitales?.map((h) => <option key={h.id} value={h.sigla}>{hospitalLabel(h)}</option>)}
            </select>
            {SIGLAS_FILTERS.map(({ key, label }) => (
              <MultiSelectDropdown
                key={key}
                label={label}
                value={getCsv(searchParams, key)}
                options={data?.siglasDistinctValues?.[key as 'universoTotalizador' | 'tipoHospital' | 'monovalencia'] ?? []}
                onChange={(v) => setCsvParam(key, v)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Filtros de dotación</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <select
              value={escalafonId[0] ?? ''}
              onChange={(e) => setCsvParam('escalafonId', e.target.value ? [e.target.value] : [])}
              className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Todos los escalafones</option>
              {escalafonesOrdenados.map((e) => <option key={e.id} value={e.id}>{escalafonLabel(e.nombre)}</option>)}
            </select>
            {MULTI_FILTERS.map(({ key, label }) => (
              <MultiSelectDropdown
                key={key}
                label={label}
                value={getCsv(searchParams, key)}
                options={data?.distinctValues?.[key as keyof NonNullable<DotacionListResponse['distinctValues']>] ?? []}
                onChange={(v) => setCsvParam(key, v)}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input type="text" value={codigoCargo} placeholder="Cód. Cargo" onChange={(e) => setParam('codigoCargo', e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
            <input type="text" value={nombreApellido} placeholder="Nombre / Apellido" onChange={(e) => setParam('nombreApellido', e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
            <input type="text" value={cuil} placeholder="CUIL" onChange={(e) => setParam('cuil', e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
            <input type="text" value={codigoRol} placeholder="Cód. SIAL" onChange={(e) => setParam('codigoRol', e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
          </div>
        </div>

        {hasActiveFilters && (
          <button onClick={() => setSearchParams({})} className="text-xs text-danger hover:underline">
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando dotación...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de dotación.</p>}

        {!isLoading && !isError && data && (
          <>
            {estadoFilter && (
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                <span className="text-xs text-gray-500">Filtro de situación: {estadoFilter}</span>
                <button onClick={() => setParam('estado', '')} className="text-xs text-danger hover:underline">Quitar</button>
              </div>
            )}

            <div className="flex-1 overflow-auto min-h-0">
              {data.rows.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">Sin registros para los filtros seleccionados.</p>
              ) : (
                <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                  <thead className="bg-navy text-white text-left sticky top-0 z-10">
                    <tr>
                      {COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.sortKey)}
                          className="px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer hover:bg-navy/80 select-none"
                        >
                          <div className="flex items-center gap-1">
                            {col.label}
                            {sortBy === col.sortKey && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.rows.map((row, idx) => (
                      <tr key={`${row.cuil}-${row.codigoRol}-${idx}`} className="hover:bg-gray-50">
                        {COLUMNS.map((col) => (
                          <td key={col.key} className="px-3 py-1.5 whitespace-nowrap text-gray-800">
                            {row[col.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>
                Mostrando {data.rows.length} de {data.total.toLocaleString('es-AR')} — página {data.page} de {data.pages || 1}
              </span>
              <div className="flex gap-2">
                <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                <button className="btn-outline" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>

      {tablaAmpliada && data && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="font-primary text-lg font-bold text-gray-900">Dotación — tabla ampliada</h2>
            <button className="btn-outline" onClick={() => setTablaAmpliada(false)}>Cerrar</button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  {COLUMNS.map((col) => <th key={col.key} className="px-3 py-2.5 font-semibold whitespace-nowrap">{col.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((row, idx) => (
                  <tr key={`${row.cuil}-${row.codigoRol}-${idx}`} className="hover:bg-gray-50">
                    {COLUMNS.map((col) => <td key={col.key} className="px-3 py-1.5 whitespace-nowrap text-gray-800">{row[col.key] ?? '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
