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
  const [exportando, setExportando] = useState<'pagina' | 'completo' | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [kpisOpen, setKpisOpen] = useState(false)

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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Acciones principales */}
          <button
            onClick={() => setKpisOpen(true)}
            className="inline-flex items-center gap-1.5 bg-secondary text-white text-sm font-semibold px-3 py-2 rounded hover:bg-secondary-dark transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            KPIs
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 bg-navy text-white text-sm font-semibold px-3 py-2 rounded hover:bg-navy/80 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4 2A1 1 0 017 19v-8.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            Búsqueda avanzada
            {hasActiveFilters && (
              <span className="bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {Array.from(searchParams.keys()).filter((k) => !['page','sortBy','sortDir'].includes(k)).length}
              </span>
            )}
          </button>

          {/* Separador */}
          <div className="w-px h-6 bg-gray-200" />

          {/* Exportar */}
          <button
            onClick={() => handleExport('pagina')}
            disabled={exportando !== null}
            className="inline-flex items-center gap-1.5 btn-outline text-sm py-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {exportando === 'pagina' ? 'Exportando...' : 'Página'}
          </button>
          <button
            onClick={() => handleExport('completo')}
            disabled={exportando !== null}
            className="inline-flex items-center gap-1.5 btn-outline text-sm py-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
            </svg>
            {exportando === 'completo' ? 'Exportando...' : 'Completo'}
          </button>


        </div>
      </div>

      {/* Indicador de filtros activos */}
      {hasActiveFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-gray-500">Filtros activos</span>
          {estadoFilter && (
            <span className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              {estadoFilter}
              <button onClick={() => setParam('estado', '')} className="hover:text-danger">×</button>
            </span>
          )}
          {sigla && (
            <span className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              {sigla}
              <button onClick={() => setParam('sigla', '')} className="hover:text-danger">×</button>
            </span>
          )}
          <button onClick={() => setSearchParams({})} className="ml-auto text-xs text-danger hover:underline">
            Limpiar todo
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando dotación...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de dotación.</p>}

        {!isLoading && !isError && data && (
          <>
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

      {/* Modal KPIs */}
      {kpisOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={() => setKpisOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="font-primary text-base font-bold text-gray-900">KPIs de Dotación</h2>
              <button onClick={() => setKpisOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5">
              <DotacionKpisPanel
                sigla={sigla}
                onFilterSigla={(s) => { setParam('sigla', s); setKpisOpen(false) }}
                estado={estadoFilter}
                onFilterEstado={(e) => { setParam('estado', e); setKpisOpen(false) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Drawer búsqueda avanzada */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="relative bg-white w-full max-w-sm h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-primary text-base font-bold text-gray-900">Búsqueda avanzada</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Hospital</p>
                <select
                  value={sigla}
                  onChange={(e) => setParam('sigla', e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todos los hospitales</option>
                  {hospitales?.map((h) => <option key={h.id} value={h.sigla}>{hospitalLabel(h)}</option>)}
                </select>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Segmentación</p>
                <div className="space-y-2">
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
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Escalafón</p>
                <select
                  value={escalafonId[0] ?? ''}
                  onChange={(e) => setCsvParam('escalafonId', e.target.value ? [e.target.value] : [])}
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todos los escalafones</option>
                  {escalafonesOrdenados.map((e) => <option key={e.id} value={e.id}>{escalafonLabel(e.nombre)}</option>)}
                </select>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Puesto y agrupamiento</p>
                <div className="space-y-2">
                  {(['unificadorPuesto', 'especialidad', 'agrupador', 'literalPuesto'] as const).map((key) => (
                    <MultiSelectDropdown
                      key={key}
                      label={MULTI_FILTERS.find((f) => f.key === key)!.label}
                      value={getCsv(searchParams, key)}
                      options={data?.distinctValues?.[key] ?? []}
                      onChange={(v) => setCsvParam(key, v)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Personal</p>
                <div className="space-y-2">
                  {(['sexo', 'situacionRevista', 'reparticion'] as const).map((key) => (
                    <MultiSelectDropdown
                      key={key}
                      label={MULTI_FILTERS.find((f) => f.key === key)!.label}
                      value={getCsv(searchParams, key)}
                      options={data?.distinctValues?.[key] ?? []}
                      onChange={(v) => setCsvParam(key, v)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Búsqueda rápida</p>
                <div className="space-y-2">
                  <input type="text" value={codigoCargo} placeholder="Cód. Cargo"
                    onChange={(e) => setParam('codigoCargo', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="text" value={nombreApellido} placeholder="Nombre / Apellido"
                    onChange={(e) => setParam('nombreApellido', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="text" value={cuil} placeholder="CUIL"
                    onChange={(e) => setParam('cuil', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="text" value={codigoRol} placeholder="Cód. SIAL"
                    onChange={(e) => setParam('codigoRol', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Edad</p>
                <div className="flex gap-2">
                  <input type="number" placeholder="Mín" min={0} max={120}
                    value={searchParams.get('edadMin') ?? ''}
                    onChange={(e) => setParam('edadMin', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="number" placeholder="Máx" min={0} max={120}
                    value={searchParams.get('edadMax') ?? ''}
                    onChange={(e) => setParam('edadMax', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Antigüedad (años)</p>
                <div className="flex gap-2">
                  <input type="number" placeholder="Mín" min={0}
                    value={searchParams.get('antiguedadMin') ?? ''}
                    onChange={(e) => setParam('antiguedadMin', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                  <input type="number" placeholder="Máx" min={0}
                    value={searchParams.get('antiguedadMax') ?? ''}
                    onChange={(e) => setParam('antiguedadMax', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
                </div>
              </section>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
              {hasActiveFilters && (
                <button onClick={() => setSearchParams({})} className="flex-1 btn-outline text-danger border-danger hover:bg-danger/5">
                  Limpiar filtros
                </button>
              )}
              <button onClick={() => setDrawerOpen(false)} className="flex-1 btn-primary">
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
