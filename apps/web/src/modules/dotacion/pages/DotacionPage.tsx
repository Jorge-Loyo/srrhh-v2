import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiClient } from '@/shared/lib/api-client'
import { downloadExcel, fetchAllPages } from '@/shared/lib/exportExcel'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { capitalizar, capitalizarEtiqueta } from '@/shared/lib/utils'
import { DotacionKpisPanel } from '../components/DotacionKpisPanel'
import {
  useDotacion, toDotacionParams,
  type DotacionFilters, type DotacionListResponse, type DotacionRow, type GrupoDotacion,
} from '../hooks/useDotacion'

// Dimensiones que participan de las UNIONES (OR). Son las que se "congelan" en
// un grupo al apretar "+ Unión". Las búsquedas rápidas, edad/antigüedad, solo
// jefes y estado NO entran al grupo: se aplican como filtros globales (AND).
const DIMENSIONES_UNION = [
  'sigla', 'universoTotalizador', 'tipoHospital', 'monovalencia',
  'escalafonId', 'modalidad', 'puestoNombre', 'especialidadNombre',
  'codigoRegistroId', 'regimen', 'tipoOrigen',
  'sexo', 'situacionRevista', 'reparticion', 'especialidadCph', 'provincia', 'localidad',
] as const

const LIMIT = 50

// S21: /dotacion combina persona + cargo. Los filtros NO son cascada forzada:
// se combinan libremente. Puesto/especialidad se buscan por NOMBRE sobre todo
// el catálogo (distinctValues del dataset filtrado). Se quitaron agrupador y
// unificadorPuesto (ya no existen en la dotación).
//
// Multi-select del CARGO (catálogo, por nombre) — distinct del propio dataset.
const CARGO_MULTI: { key: keyof DotacionFilters; distinctKey: keyof NonNullable<DotacionListResponse['distinctValues']>; label: string }[] = [
  { key: 'puestoNombre', distinctKey: 'puesto', label: 'Puesto' },
  { key: 'especialidadNombre', distinctKey: 'especialidad', label: 'Especialidad' },
  { key: 'regimen', distinctKey: 'regimen', label: 'Régimen' },
  { key: 'tipoOrigen', distinctKey: 'tipoOrigen', label: 'Tipo de origen' },
]

// Multi-select de la PERSONA / ocupación — distinct del propio dataset.
const PERSONA_MULTI: { key: keyof DotacionFilters; distinctKey: keyof NonNullable<DotacionListResponse['distinctValues']>; label: string }[] = [
  { key: 'sexo', distinctKey: 'sexo', label: 'Sexo' },
  { key: 'situacionRevista', distinctKey: 'situacionRevista', label: 'Situación de Revista' },
  { key: 'reparticion', distinctKey: 'reparticion', label: 'Repartición (SIAL)' },
  { key: 'especialidadCph', distinctKey: 'especialidadCph', label: 'Especialidad CPH' },
  { key: 'provincia', distinctKey: 'provincia', label: 'Provincia' },
  { key: 'localidad', distinctKey: 'localidad', label: 'Localidad' },
]

const SIGLAS_FILTERS: { key: keyof DotacionFilters; label: string }[] = [
  { key: 'universoTotalizador', label: 'Universo' },
  { key: 'tipoHospital', label: 'Tipo Hospital' },
  { key: 'monovalencia', label: 'Monovalencia' },
]

// Etiqueta legible de tipo de origen (R / TTR / null=normal).
function tipoOrigenLabel(v: string): string {
  if (v === 'R') return 'Reemplazante (R)'
  if (v === 'TTR') return 'Titular transitorio (TTR)'
  return v
}

// Columnas de la tabla. Puesto/especialidad muestran el nombre del catálogo
// (capitalizado). Se agregaron Cód. Registro; se quitaron Agrupador/Unificador.
const COLUMNS: { key: keyof DotacionRow; label: string; sortKey?: string; cap?: boolean }[] = [
  { key: 'codigoRol', label: 'Cód. SIAL', sortKey: 'codigoRol' },
  { key: 'cuil', label: 'CUIL', sortKey: 'cuil' },
  { key: 'nombreApellido', label: 'Apellido y Nombre', sortKey: 'nombreApellido' },
  { key: 'sigla', label: 'Repartición', sortKey: 'sigla' },
  { key: 'escalafon', label: 'Escalafón', sortKey: 'escalafon' },
  { key: 'codigoRegistro', label: 'Cód. Registro' },
  { key: 'codigoCargo', label: 'Cód. Cargo', sortKey: 'codigoCargo' },
  { key: 'literalPuesto', label: 'Puesto', sortKey: 'literalPuesto', cap: true },
  { key: 'especialidad', label: 'Especialidad', sortKey: 'especialidad', cap: true },
  { key: 'regimen', label: 'Régimen' },
  { key: 'situacionRevista', label: 'Situación de Revista', sortKey: 'situacionRevista' },
  { key: 'reparticion', label: 'Repartición (SIAL)', sortKey: 'reparticion' },
  { key: 'sexo', label: 'Sexo', sortKey: 'sexo' },
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

  // Uniones (OR) ya fijadas — persistidas como JSON en el searchParam `grupos`.
  const grupos: GrupoDotacion[] = (() => {
    const raw = searchParams.get('grupos')
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as GrupoDotacion[]) : []
    } catch {
      return []
    }
  })()

  const sigla = searchParams.get('sigla') ?? ''
  const escalafonId = getCsv(searchParams, 'escalafonId')
  const codigoRegistroId = getCsv(searchParams, 'codigoRegistroId')
  const modalidad = (searchParams.get('modalidad') ?? '') as '' | 'pof' | 'pou'
  const soloJefes = searchParams.get('soloJefes') === 'true'
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

  // Guarda la lista de grupos como JSON en la URL (o la borra si queda vacía).
  function setGrupos(next: GrupoDotacion[]) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next.length) params.set('grupos', JSON.stringify(next))
      else params.delete('grupos')
      params.delete('page')
      return params
    })
  }

  function quitarGrupo(index: number) {
    setGrupos(grupos.filter((_, i) => i !== index))
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p === 1) next.delete('page'); else next.set('page', String(p))
      return next
    }, { replace: true })
  }

  function handleSort(sortKey?: string) {
    if (!sortKey) return
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
    ...(grupos.length && { grupos }),
    ...(sigla && { sigla: [sigla] }),
    ...(getCsv(searchParams, 'universoTotalizador').length && { universoTotalizador: getCsv(searchParams, 'universoTotalizador') }),
    ...(getCsv(searchParams, 'tipoHospital').length && { tipoHospital: getCsv(searchParams, 'tipoHospital') }),
    ...(getCsv(searchParams, 'monovalencia').length && { monovalencia: getCsv(searchParams, 'monovalencia') }),
    // Catálogo del cargo (multi-select combinable, por nombre / FK).
    ...(escalafonId.length && { escalafonId }),
    ...(modalidad && { modalidad }),
    ...(getCsv(searchParams, 'puestoNombre').length && { puestoNombre: getCsv(searchParams, 'puestoNombre') }),
    ...(getCsv(searchParams, 'especialidadNombre').length && { especialidadNombre: getCsv(searchParams, 'especialidadNombre') }),
    ...(codigoRegistroId.length && { codigoRegistroId }),
    ...(getCsv(searchParams, 'regimen').length && { regimen: getCsv(searchParams, 'regimen') }),
    ...(getCsv(searchParams, 'tipoOrigen').length && { tipoOrigen: getCsv(searchParams, 'tipoOrigen') }),
    ...(soloJefes && { soloJefes: true }),
    // Persona / ocupación.
    ...(getCsv(searchParams, 'sexo').length && { sexo: getCsv(searchParams, 'sexo') }),
    ...(getCsv(searchParams, 'situacionRevista').length && { situacionRevista: getCsv(searchParams, 'situacionRevista') }),
    ...(getCsv(searchParams, 'reparticion').length && { reparticion: getCsv(searchParams, 'reparticion') }),
    ...(getCsv(searchParams, 'especialidadCph').length && { especialidadCph: getCsv(searchParams, 'especialidadCph') }),
    ...(getCsv(searchParams, 'provincia').length && { provincia: getCsv(searchParams, 'provincia') }),
    ...(getCsv(searchParams, 'localidad').length && { localidad: getCsv(searchParams, 'localidad') }),
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
  const { data: escalafones } = useEscalafones(true)
  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )
  const codigosRegistro = data?.codigoRegistro ?? []

  const hasActiveFilters = Array.from(searchParams.keys()).some((k) => !['page', 'sortBy', 'sortDir'].includes(k))
  const estadoFilter = searchParams.get('estado') ?? ''

  // Multi-select de escalafón (por id; muestra el nombre). Independiente:
  // se puede elegir varios; el resto de filtros se combinan con AND.
  const escalafonOptions = escalafonesOrdenados.map((e) => escalafonLabel(e.nombre))
  const escalafonNombreToId = (nombre: string) =>
    escalafonesOrdenados.find((e) => escalafonLabel(e.nombre) === nombre)?.id ?? ''
  const escalafonIdToNombre = (id: string) => {
    const e = escalafonesOrdenados.find((x) => x.id === id)
    return e ? escalafonLabel(e.nombre) : id
  }
  // Etiqueta "codigo — literal" (ej. "24 — Residencias"): el código desambigua
  // literales repetidos (22 y 37 comparten "Nueva Carrera Prof. Hosp").
  const codigoRegistroLabel = (c: { codigo: string; nombre: string }) => `${c.codigo} — ${c.nombre}`
  const codigoRegistroOptions = codigosRegistro.map(codigoRegistroLabel)
  const codigoRegistroNombreToId = (label: string) => codigosRegistro.find((c) => codigoRegistroLabel(c) === label)?.id ?? ''
  const codigoRegistroIdToNombre = (id: string) => {
    const c = codigosRegistro.find((x) => x.id === id)
    return c ? codigoRegistroLabel(c) : id
  }

  // ¿Hay dimensiones de unión seteadas en el "grupo en edición" (filtros sueltos)?
  const hayDimensionEnEdicion = DIMENSIONES_UNION.some((k) => {
    if (k === 'modalidad') return Boolean(modalidad)
    if (k === 'sigla') return Boolean(sigla)
    return getCsv(searchParams, k).length > 0
  })

  // Toma las dimensiones actuales (grupo en edición), las congela como una nueva
  // unión con etiquetas legibles para los chips, y limpia esos filtros sueltos
  // para armar el próximo grupo. Las búsquedas rápidas / rangos / solo jefes NO
  // se tocan (son filtros globales AND).
  function agregarUnion() {
    if (!hayDimensionEnEdicion) return
    const g: GrupoDotacion = {}
    const labels: string[] = []

    const addArr = (key: Exclude<keyof GrupoDotacion, 'labels' | 'modalidad'>, valores: string[], chip: (v: string) => string = (v) => v) => {
      if (valores.length) {
        g[key] = valores
        labels.push(valores.map(chip).join(' / '))
      }
    }

    if (sigla) addArr('sigla', [sigla])
    addArr('universoTotalizador', getCsv(searchParams, 'universoTotalizador'), capitalizarEtiqueta)
    addArr('tipoHospital', getCsv(searchParams, 'tipoHospital'), capitalizarEtiqueta)
    addArr('monovalencia', getCsv(searchParams, 'monovalencia'), capitalizarEtiqueta)
    addArr('escalafonId', getCsv(searchParams, 'escalafonId'), escalafonIdToNombre)
    if (modalidad) { g.modalidad = modalidad; labels.push(modalidad === 'pof' ? 'POF' : 'POU') }
    addArr('puestoNombre', getCsv(searchParams, 'puestoNombre'), capitalizar)
    addArr('especialidadNombre', getCsv(searchParams, 'especialidadNombre'), capitalizar)
    addArr('codigoRegistroId', getCsv(searchParams, 'codigoRegistroId'), codigoRegistroIdToNombre)
    addArr('regimen', getCsv(searchParams, 'regimen'))
    addArr('tipoOrigen', getCsv(searchParams, 'tipoOrigen'), tipoOrigenLabel)
    addArr('sexo', getCsv(searchParams, 'sexo'))
    addArr('situacionRevista', getCsv(searchParams, 'situacionRevista'))
    addArr('reparticion', getCsv(searchParams, 'reparticion'))
    addArr('especialidadCph', getCsv(searchParams, 'especialidadCph'))
    addArr('provincia', getCsv(searchParams, 'provincia'))
    addArr('localidad', getCsv(searchParams, 'localidad'))
    g.labels = labels

    // Agrega el grupo y limpia las dimensiones sueltas en una sola actualización.
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('grupos', JSON.stringify([...grupos, g]))
      for (const k of DIMENSIONES_UNION) params.delete(k)
      params.delete('page')
      return params
    })
  }

  async function handleExport(kind: 'pagina' | 'completo') {
    if (!data) return
    setExportando(kind)
    try {
      const rowsMapper = (rows: DotacionRow[]) => rows.map((r) => ({
        'Cód. SIAL': r.codigoRol, CUIL: r.cuil, 'Apellido y Nombre': r.nombreApellido,
        Repartición: r.sigla, Escalafón: r.escalafon, 'Cód. Registro': r.codigoRegistro ?? '',
        'Cód. Cargo': r.codigoCargo ?? '',
        Puesto: capitalizar(r.literalPuesto), Especialidad: capitalizar(r.especialidad),
        Régimen: r.regimen ?? '', 'Situación de Revista': r.situacionRevista ?? '',
        'Repartición (SIAL)': r.reparticion ?? '', Sexo: r.sexo ?? '',
        Provincia: r.provincia ?? '', Localidad: r.localidad ?? '',
        Edad: r.edad ?? '', Antigüedad: r.antiguedad ?? '',
        'Mail Laboral': r.mailLaboral ?? '', Teléfono: r.telefono ?? '',
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

  function renderCell(row: DotacionRow, col: (typeof COLUMNS)[number]) {
    const raw = row[col.key]
    if (raw === null || raw === undefined || raw === '') return '—'
    return col.cap ? capitalizar(String(raw)) : raw
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-primary text-xl font-bold text-gray-900">Dotación</h1>
          <p className="text-xs text-gray-400">{sigla ? `Repartición: ${sigla}` : 'Todas las reparticiones'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

          <div className="w-px h-6 bg-gray-200" />

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
          {grupos.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              {grupos.length} {grupos.length === 1 ? 'unión' : 'uniones'} (O)
              <button onClick={() => setGrupos([])} className="hover:text-danger">×</button>
            </span>
          )}
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
          {soloJefes && (
            <span className="inline-flex items-center gap-1 bg-secondary/10 text-secondary text-xs px-2 py-0.5 rounded-full">
              Solo jefes
              <button onClick={() => setParam('soloJefes', '')} className="hover:text-danger">×</button>
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
                          className={`px-3 py-2.5 font-semibold whitespace-nowrap select-none ${col.sortKey ? 'cursor-pointer hover:bg-navy/80' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            {col.label}
                            {col.sortKey && sortBy === col.sortKey && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
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
                            {renderCell(row, col)}
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

              {/* Uniones (OR): grupos ya fijados + acción para fijar el actual */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Uniones (O)</p>
                  <button
                    type="button"
                    onClick={agregarUnion}
                    disabled={!hayDimensionEnEdicion}
                    title="Fijar los filtros de abajo como una unión (OR) y empezar otra combinación"
                    className="h-8 px-3 rounded border border-secondary text-secondary text-xs font-semibold hover:bg-secondary/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Unión
                  </button>
                </div>
                {grupos.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    Combiná filtros abajo y tocá <span className="font-semibold">+ Unión</span> para
                    sumar un conjunto. Los conjuntos se unen con O (ej. “psicólogos del Hospital A” O “enfermeros del Hospital B”).
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {grupos.map((g, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-medium text-secondary"
                      >
                        {(g.labels && g.labels.length ? g.labels.join(' · ') : 'Filtro')}
                        <button
                          type="button"
                          onClick={() => quitarGrupo(i)}
                          className="ml-0.5 hover:text-secondary/60"
                          aria-label="Quitar unión"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Repartición</p>
                <select
                  value={sigla}
                  onChange={(e) => setParam('sigla', e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todas las reparticiones</option>
                  {hospitales?.map((h) => <option key={h.id} value={h.sigla}>{hospitalLabel(h)}</option>)}
                </select>
                <div className="space-y-2 mt-2">
                  {SIGLAS_FILTERS.map(({ key, label }) => (
                    <MultiSelectDropdown
                      key={key}
                      label={label}
                      value={getCsv(searchParams, key)}
                      options={data?.siglasDistinctValues?.[key as 'universoTotalizador' | 'tipoHospital' | 'monovalencia'] ?? []}
                      onChange={(v) => setCsvParam(key, v)}
                      formatOption={capitalizarEtiqueta}
                    />
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cargo</p>
                <div className="space-y-2">
                  {/* Escalafón (multi, por id mostrando nombre) */}
                  <MultiSelectDropdown
                    label="Escalafón"
                    value={escalafonId.map(escalafonIdToNombre)}
                    options={escalafonOptions}
                    onChange={(nombres) => setCsvParam('escalafonId', nombres.map(escalafonNombreToId).filter(Boolean))}
                  />
                  {/* Modalidad (única) */}
                  <select
                    value={modalidad}
                    onChange={(e) => setParam('modalidad', e.target.value)}
                    className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  >
                    <option value="">Todas las modalidades</option>
                    <option value="pof">Planta (POF)</option>
                    <option value="pou">Guardia (POU)</option>
                  </select>
                  {/* Código de registro (multi, por id mostrando nombre) */}
                  <MultiSelectDropdown
                    label="Código de registro"
                    value={codigoRegistroId.map(codigoRegistroIdToNombre)}
                    options={codigoRegistroOptions}
                    onChange={(nombres) => setCsvParam('codigoRegistroId', nombres.map(codigoRegistroNombreToId).filter(Boolean))}
                  />
                  {/* Puesto / especialidad por NOMBRE (buscables sobre todo el
                      catálogo — se acotan solos según lo ya elegido vía distinct) */}
                  {CARGO_MULTI.map(({ key, distinctKey, label }) => (
                    <MultiSelectDropdown
                      key={key}
                      label={label}
                      value={getCsv(searchParams, key)}
                      options={data?.distinctValues?.[distinctKey] ?? []}
                      onChange={(v) => setCsvParam(key, v)}
                      formatOption={distinctKey === 'tipoOrigen' ? tipoOrigenLabel : distinctKey === 'puesto' || distinctKey === 'especialidad' ? capitalizar : undefined}
                    />
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Personal</p>
                <div className="space-y-2">
                  {/* Solo jefes (toggle) */}
                  <button
                    type="button"
                    onClick={() => setParam('soloJefes', soloJefes ? '' : 'true')}
                    className={`w-full h-10 px-3 rounded border text-sm font-semibold transition-colors ${
                      soloJefes
                        ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    👔 Solo jefes
                  </button>
                  {PERSONA_MULTI.map(({ key, distinctKey, label }) => (
                    <MultiSelectDropdown
                      key={key}
                      label={label}
                      value={getCsv(searchParams, key)}
                      options={data?.distinctValues?.[distinctKey] ?? []}
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
