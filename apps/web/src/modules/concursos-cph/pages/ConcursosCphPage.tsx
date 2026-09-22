import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoConcursoCph } from '@srrhh/types'
import type { ConcursoCph, ConcursoCphFilters } from '@srrhh/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { useConcursosCph } from '../hooks/useConcursosCph'
import { useEtiquetas, useAsignarEtiqueta, useCrearEtiqueta } from '../hooks/useEtiquetas'
import { FlujoConcursoModal } from '../components/FlujoConcursoModal'
import { EtiquetasControl } from '../components/EtiquetasControl'
import { JuradosTab } from '../components/JuradosTab'
import { OrdenesMeritoTab } from '../components/OrdenesMeritoTab'
import { apiClient } from '@/shared/lib/api-client'
import { useToast } from '@/shared/components/ui/useToast'
import {
  ESTADO_LABEL,
  SUB_ESTADO_OPTIONS,
  SUB_ESTADO_3_OPTIONS,
  diasSinMovimiento,
} from '../lib/labels'

const LIMIT = 50

// Semáforo de estado del concurso (primera columna de la tabla). El campo
// booleano `suspendido` puede estar activo aunque el estado calculado no sea
// 'suspendido', así que tiene prioridad para el color rojo.
function semaforoClass(c: ConcursoCph): string {
  if (c.suspendido || c.estado === 'suspendido') return 'bg-red-500'
  if (c.estado === 'activo') return 'bg-green-500'
  if (c.estado === 'finalizado') return 'bg-orange-500'
  return 'bg-gray-300' // no_iniciado
}

function semaforoLabel(c: ConcursoCph): string {
  if (c.suspendido || c.estado === 'suspendido') return 'Suspendido'
  if (c.estado === 'activo') return 'Activo'
  if (c.estado === 'finalizado') return 'Finalizado'
  return 'No iniciado'
}

// Clasifica la documentación respaldatoria del concurso en uno de 3 tipos:
//  - Baja: el concurso viene de una baja (tiene baja asociada) → expediente de baja
//  - Ampliación: cargo nuevo con expediente de alta cargado (cargo.expediente)
//  - Cobertura: cargo sin baja ni expediente de alta (cobertura de dotación, sin doc)
function respaldatoria(c: ConcursoCph): {
  tipo: 'Baja' | 'Ampliación' | 'Cobertura'
  expediente: string | null
  badgeClass: string
} {
  if (c.concurso?.baja) {
    return {
      tipo: 'Baja',
      expediente: c.eeBaja ?? null,
      badgeClass: 'bg-orange-100 text-orange-700',
    }
  }
  const expCargo = c.concurso?.cargo?.expediente
  if (expCargo) {
    return { tipo: 'Ampliación', expediente: expCargo, badgeClass: 'bg-blue-100 text-blue-700' }
  }
  return { tipo: 'Cobertura', expediente: null, badgeClass: 'bg-purple-100 text-purple-700' }
}

// Las 5 etapas del concurso CPH (mismas que el wizard).
const ETAPAS = [
  'Baja / Apertura',
  'Autorización / Jurado',
  'Inscripción / Examen / OM',
  'IFACS / INSAL',
  'Designación',
] as const

// Mapea el subEstado (con su prefijo de letra) al número de etapa 1..5.
function etapaActual(subEstado: string | null): number {
  const s = subEstado ?? ''
  if (['A-AUTZN', 'B-SORTEO JUR', 'C-DISPO DE LLAMADO'].includes(s)) return 2
  if (['C2-INSCRIPCION EX', 'D-EXAMEN PUBLICADO', 'E-ORDEN DE MERITO'].includes(s)) return 3
  if (['F-IFACS', 'G-INSAL'].includes(s)) return 4
  if (
    [
      'H-TAD',
      'I-CARGA DOCU',
      'J-APTO MED',
      'K-ITE',
      'L-PYCTO DE RESO',
      'M-RESO A LA FIRMA',
      'N-DESIGNADO',
      'O-ALTA SIAL',
      'Q-DESIERTO',
    ].includes(s)
  )
    return 5
  return 1 // VACANTE, NO INICIADO, A-CARATULADO
}

// Mini-stepper de 5 pasos para la columna "Etapa". El paso actual se resalta,
// los anteriores van con check, los siguientes en gris.
function EtapaStepper({ subEstado }: { subEstado: string | null }) {
  const actual = etapaActual(subEstado)
  return (
    <div className="flex items-center gap-1">
      {ETAPAS.map((titulo, idx) => {
        const num = idx + 1
        const completa = num < actual
        const esActual = num === actual
        return (
          <span
            key={num}
            title={`${num}. ${titulo}${esActual ? ' (actual)' : completa ? ' ✓' : ''}`}
            className={[
              'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
              esActual
                ? 'bg-secondary text-white ring-2 ring-secondary/30'
                : completa
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-400',
            ].join(' ')}
          >
            {completa ? '✓' : num}
          </span>
        )
      })}
    </div>
  )
}

type TabId = 'concursos' | 'jurados' | 'ordenes'

// Contenedor con pestañas: Concursos (listado) | Jurados | Órdenes de mérito.
export function ConcursosCphPage() {
  const [tab, setTab] = useState<TabId>('concursos')

  const tabs: { id: TabId; label: string }[] = [
    { id: 'concursos', label: 'Concursos' },
    { id: 'jurados', label: 'Jurados' },
    { id: 'ordenes', label: 'Órdenes de mérito' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.id
                ? 'border-secondary text-secondary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'concursos' && <ConcursosListaTab />}
      {tab === 'jurados' && <JuradosTab />}
      {tab === 'ordenes' && <OrdenesMeritoTab />}
    </div>
  )
}

// Tab "Concursos": el listado principal (filtros + tabla + etiquetado masivo).
function ConcursosListaTab() {
  const [search, setSearch] = useState('')
  const [especialidad, setEspecialidad] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [estado, setEstado] = useState<'' | EstadoConcursoCph>('')
  const [subEstado, setSubEstado] = useState('')
  const [subEstado3, setSubEstado3] = useState('')
  const [origen, setOrigen] = useState<'' | 'baja' | 'ampliacion' | 'cobertura'>('')
  // Etapa 5: '' = todos, 'true' = con persona / validados, 'false' = sin.
  const [personaOm, setPersonaOm] = useState<'' | 'true' | 'false'>('')
  const [validado, setValidado] = useState<'' | 'true' | 'false'>('')
  const [etiquetasFiltro, setEtiquetasFiltro] = useState<string[]>([]) // nombres de etiqueta
  const [detalle, setDetalle] = useState<ConcursoCph | null>(null)
  const [page, setPage] = useState(1)
  const [showFlujo, setShowFlujo] = useState(false)
  const [conFaltantes, setConFaltantes] = useState(false)
  const [importando, setImportando] = useState(false)
  const [menuAcciones, setMenuAcciones] = useState(false)
  const menuAccionesRef = useRef<HTMLDivElement>(null)
  const [drawerAvanzado, setDrawerAvanzado] = useState(false)
  const [importResult, setImportResult] = useState<{
    total: number
    actualizados: number
    creados: number
    noEncontrados: number
  } | null>(null)
  const searchDebounced = useDebounce(search, 300)
  const especialidadDebounced = useDebounce(especialidad, 300)

  // ── Etiquetado masivo ──
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [etiquetaMasiva, setEtiquetaMasiva] = useState('') // nombre elegido o nuevo
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false)
  const { data: catalogoEtiquetas = [] } = useEtiquetas()
  const asignarEtiqueta = useAsignarEtiqueta()
  const crearEtiqueta = useCrearEtiqueta()
  const { toast, ToastUI } = useToast()

  useEffect(() => {
    if (!menuAcciones) return
    function handleClickOutside(e: MouseEvent) {
      if (menuAccionesRef.current && !menuAccionesRef.current.contains(e.target as Node)) {
        setMenuAcciones(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuAcciones])

  async function handleImportarCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiClient.post('/api/v1/concursos-cph/importar-csv', form)
      setImportResult(res.data.data)
    } catch {
      toast.error('Error al importar el archivo')
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  const filters: ConcursoCphFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(especialidadDebounced && { especialidad: especialidadDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(estado && { estado }),
    ...(subEstado && { subEstado }),
    ...(subEstado3 && { subEstado3 }),
    ...(origen && { origen }),
    ...(conFaltantes && { conFaltantes: true }),
    ...(personaOm && { personaOm: personaOm === 'true' }),
    ...(validado && { validado: validado === 'true' }),
    ...(etiquetasFiltro.length && {
      etiquetaIds: etiquetasFiltro
        .map((nombre) => catalogoEtiquetas.find((e) => e.nombre === nombre)?.id)
        .filter((x): x is string => !!x)
        .join(','),
    }),
  }

  const { data, isLoading, isFetching, isError } = useConcursosCph(filters)
  const { data: hospitales } = useHospitales()

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  const filasVisibles = data?.data ?? []
  const todasSeleccionadas =
    filasVisibles.length > 0 && filasVisibles.every((c) => seleccionados.has(c.id))

  function toggleSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodas() {
    setSeleccionados((prev) => {
      if (filasVisibles.every((c) => prev.has(c.id))) {
        // deseleccionar solo las visibles
        const next = new Set(prev)
        filasVisibles.forEach((c) => next.delete(c.id))
        return next
      }
      const next = new Set(prev)
      filasVisibles.forEach((c) => next.add(c.id))
      return next
    })
  }

  function salirModoSeleccion() {
    setModoSeleccion(false)
    setSeleccionados(new Set())
    setEtiquetaMasiva('')
  }

  // Aplica la etiqueta elegida (existente por nombre, o nueva) a todos los
  // concursos seleccionados. Crea la etiqueta si el nombre no existe.
  async function aplicarEtiquetaMasiva() {
    const nombre = etiquetaMasiva.trim()
    const ids = [...seleccionados]
    if (!nombre || ids.length === 0) return
    setAplicandoMasivo(true)
    try {
      const existente = catalogoEtiquetas.find(
        (e) => e.nombre.toLowerCase() === nombre.toLowerCase(),
      )
      const etiquetaId = existente ? existente.id : (await crearEtiqueta.mutateAsync({ nombre })).id
      let ok = 0
      for (const concursoCphId of ids) {
        try {
          await asignarEtiqueta.mutateAsync({ etiquetaId, concursoCphId })
          ok++
        } catch {
          // sigue con los demás
        }
      }
      toast.success(`Etiqueta "${nombre}" aplicada a ${ok} de ${ids.length} concurso(s)`)
      salirModoSeleccion()
    } catch {
      toast.error('No se pudo aplicar la etiqueta')
    } finally {
      setAplicandoMasivo(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Concursos CPH</h1>
          <div className="relative" ref={menuAccionesRef}>
            <button
              onClick={() => setMenuAcciones((v) => !v)}
              className={`btn-outline text-sm ${
                conFaltantes || modoSeleccion
                  ? 'bg-secondary/10 border-secondary text-secondary font-semibold'
                  : ''
              }`}
            >
              ⚙ Acciones ▾
            </button>
            {menuAcciones && (
              <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                <label
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 cursor-pointer ${
                    importando ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  {importando ? '…' : '↑'} {importando ? 'Importando...' : 'Importar CSV'}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      handleImportarCsv(e)
                      setMenuAcciones(false)
                    }}
                    disabled={importando}
                  />
                </label>
                <button
                  onClick={() => {
                    setShowFlujo(true)
                    setMenuAcciones(false)
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  📋 Flujo del concurso
                </button>
                <button
                  onClick={() => {
                    setConFaltantes((v) => !v)
                    setPage(1)
                    setMenuAcciones(false)
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${
                    conFaltantes ? 'text-orange-700 font-semibold' : 'text-gray-700'
                  }`}
                >
                  ⚠️ {conFaltantes ? 'Quitar filtro: con documentación faltante' : 'Con documentación faltante'}
                </button>
                <button
                  onClick={() => {
                    if (modoSeleccion) salirModoSeleccion()
                    else setModoSeleccion(true)
                    setMenuAcciones(false)
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${
                    modoSeleccion ? 'text-secondary font-semibold' : 'text-gray-700'
                  }`}
                >
                  🏷️ {modoSeleccion ? 'Cancelar selección' : 'Etiquetar varios'}
                </button>
              </div>
            )}
          </div>
        </div>
        {importResult && (
          <div className="text-sm bg-green-50 border border-green-200 rounded px-3 py-2 text-green-800">
            Importación completada — {importResult.actualizados} actualizados,{' '}
            {importResult.creados} creados, {importResult.noEncontrados} no encontrados de{' '}
            {importResult.total} filas.
          </div>
        )}

        {modoSeleccion && (
          <div className="flex flex-wrap items-center gap-3 bg-secondary/5 border border-secondary/30 rounded px-3 py-2">
            <span className="text-sm font-medium text-gray-700">
              {seleccionados.size} concurso(s) seleccionado(s)
            </span>
            <input
              type="text"
              list="etiquetas-masivo"
              value={etiquetaMasiva}
              onChange={(e) => setEtiquetaMasiva(e.target.value)}
              placeholder="Etiqueta a aplicar (existente o nueva)"
              className="h-9 px-3 border border-gray-300 rounded text-sm min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            <datalist id="etiquetas-masivo">
              {catalogoEtiquetas.map((e) => (
                <option key={e.id} value={e.nombre} />
              ))}
            </datalist>
            <button
              onClick={aplicarEtiquetaMasiva}
              disabled={aplicandoMasivo || seleccionados.size === 0 || !etiquetaMasiva.trim()}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {aplicandoMasivo ? 'Aplicando...' : 'Aplicar etiqueta'}
            </button>
            <span className="text-xs text-gray-500">
              Tip: podés usar el filtro y "Seleccionar todos" para etiquetar por lote.
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por expediente, persona, observaciones..."
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <input
            type="text"
            placeholder="Especialidad..."
            value={especialidad}
            onChange={(e) => resetPage(setEspecialidad)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded min-w-[180px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <SearchableSelect
            value={hospitalId}
            onChange={resetPage(setHospitalId)}
            options={hospitales?.map((h) => hospitalLabel(h)) ?? []}
            placeholder="Todas las siglas"
            className="min-w-[220px]"
            valueToDisplay={(id) => {
              const h = hospitales?.find((x) => x.id === id)
              return h ? hospitalLabel(h) : ''
            }}
            displayToValue={(label) => hospitales?.find((h) => hospitalLabel(h) === label)?.id ?? ''}
          />
        </div>

        {/* Filtro rápido por estado (4 botones) + filtros avanzados */}
        <div className="flex flex-wrap items-center gap-2">
          {Object.values(EstadoConcursoCph).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => resetPage(setEstado)(estado === e ? '' : e)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                estado === e
                  ? 'bg-secondary text-white border-secondary'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-secondary hover:text-secondary'
              }`}
            >
              {ESTADO_LABEL[e]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDrawerAvanzado(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 text-gray-600 hover:border-secondary hover:text-secondary transition-colors ml-auto"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4 2A1 1 0 017 19v-8.586L3.293 6.707A1 1 0 013 6V3z"
                clipRule="evenodd"
              />
            </svg>
            Filtros avanzados
            {(subEstado ||
              subEstado3 ||
              origen ||
              personaOm ||
              validado ||
              etiquetasFiltro.length > 0) && (
              <span className="bg-secondary/20 text-secondary text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {[subEstado, subEstado3, origen, personaOm, validado].filter(Boolean).length +
                  (etiquetasFiltro.length > 0 ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Burbujas de filtros aplicados */}
        {(() => {
          const origenLabel: Record<string, string> = {
            baja: 'Baja',
            ampliacion: 'Ampliación',
            cobertura: 'Cobertura de dotación',
          }
          const chips: { label: string; onClear: () => void }[] = []
          if (searchDebounced)
            chips.push({ label: `Búsqueda: "${searchDebounced}"`, onClear: () => setSearch('') })
          if (especialidadDebounced)
            chips.push({
              label: `Especialidad: "${especialidadDebounced}"`,
              onClear: () => setEspecialidad(''),
            })
          if (hospitalId) {
            const h = hospitales?.find((x) => x.id === hospitalId)
            chips.push({
              label: `Sigla: ${h ? hospitalLabel(h) : hospitalId}`,
              onClear: () => resetPage(setHospitalId)(''),
            })
          }
          if (estado)
            chips.push({
              label: `Estado: ${ESTADO_LABEL[estado]}`,
              onClear: () => resetPage(setEstado)('' as '' | EstadoConcursoCph),
            })
          if (subEstado)
            chips.push({
              label: `Sub-estado: ${subEstado}`,
              onClear: () => resetPage(setSubEstado)(''),
            })
          if (subEstado3)
            chips.push({
              label: `Etapa: ${subEstado3}`,
              onClear: () => resetPage(setSubEstado3)(''),
            })
          if (origen)
            chips.push({
              label: `Respaldatoria: ${origenLabel[origen]}`,
              onClear: () => resetPage(setOrigen)('' as '' | 'baja' | 'ampliacion' | 'cobertura'),
            })
          if (conFaltantes)
            chips.push({
              label: 'Con documentación faltante',
              onClear: () => {
                setConFaltantes(false)
                setPage(1)
              },
            })
          if (personaOm)
            chips.push({
              label:
                personaOm === 'true'
                  ? 'Con persona del orden de mérito'
                  : 'Sin persona del orden de mérito',
              onClear: () => resetPage(setPersonaOm)(''),
            })
          if (validado)
            chips.push({
              label: validado === 'true' ? 'Validados' : 'Sin validar',
              onClear: () => resetPage(setValidado)(''),
            })
          if (etiquetasFiltro.length > 0)
            chips.push({
              label: `Etiquetas: ${etiquetasFiltro.join(', ')}`,
              onClear: () => resetPage(setEtiquetasFiltro)([]),
            })
          if (chips.length === 0) return null
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">Filtros:</span>
              {chips.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-0.5 text-xs text-secondary"
                >
                  {c.label}
                  <button
                    type="button"
                    onClick={c.onClear}
                    className="leading-none opacity-70 hover:opacity-100"
                    aria-label={`Quitar filtro ${c.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setEspecialidad('')
                  setHospitalId('')
                  setEstado('')
                  setSubEstado('')
                  setSubEstado3('')
                  setOrigen('')
                  setConFaltantes(false)
                  setPersonaOm('')
                  setValidado('')
                  setEtiquetasFiltro([])
                  setPage(1)
                }}
                className="text-xs text-gray-500 underline hover:text-gray-700"
              >
                Limpiar todo
              </button>
            </div>
          )
        })()}
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando concursos...</p>}
        {isError && (
          <p className="p-6 text-sm text-danger">No se pudo cargar el listado de concursos CPH.</p>
        )}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">
                Sin resultados para los filtros aplicados.
              </p>
            )}

            {data.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''}`}>
                  <thead className="bg-navy text-white text-left">
                    <tr>
                      {modoSeleccion && (
                        <th className="px-3 py-3 font-semibold w-8">
                          <input
                            type="checkbox"
                            checked={todasSeleccionadas}
                            onChange={toggleTodas}
                            aria-label="Seleccionar todos los visibles"
                            className="h-4 w-4 cursor-pointer align-middle"
                          />
                        </th>
                      )}
                      <th className="px-3 py-3 font-semibold w-8" title="Estado" />
                      <th className="px-4 py-3 font-semibold">Respaldatoria</th>
                      <th className="px-4 py-3 font-semibold">Puesto</th>
                      <th className="px-4 py-3 font-semibold">Especialidad</th>
                      <th className="px-4 py-3 font-semibold">Hospital</th>
                      <th className="px-4 py-3 font-semibold">Etapa</th>
                      <th className="px-4 py-3 font-semibold">Sub-estado</th>
                      <th className="px-4 py-3 font-semibold">Etiquetas</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.data.map((c) => {
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          {modoSeleccion && (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={seleccionados.has(c.id)}
                                onChange={() => toggleSeleccion(c.id)}
                                aria-label={`Seleccionar concurso ${c.eeConcurso ?? c.id}`}
                                className="h-4 w-4 cursor-pointer align-middle"
                              />
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${semaforoClass(c)}`}
                              title={semaforoLabel(c)}
                              aria-label={semaforoLabel(c)}
                            />
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {(() => {
                              const r = respaldatoria(c)
                              return (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-gray-500">
                                    {r.expediente ?? (r.tipo === 'Cobertura' ? 'Sin doc.' : '—')}
                                  </span>
                                  <span
                                    className={`inline-flex items-center rounded px-2 py-0.5 font-medium ${r.badgeClass}`}
                                  >
                                    {r.tipo}
                                  </span>
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {c.puestoSolicitado ?? c.concurso?.cargo?.literalPuesto ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {c.especialidadSolicitada ??
                              c.concurso?.cargo?.especialidadLegacy ??
                              c.concurso?.cargo?.especialidad ??
                              '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                          <td className="px-4 py-3">
                            <EtapaStepper subEstado={c.subEstado} />
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.subEstado ?? '—'}</td>
                          <td className="px-4 py-3">
                            <EtiquetasControl
                              concursoCphId={c.id}
                              asignadas={c.etiquetas ?? []}
                              variant="compacto"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setDetalle(c)}
                                title="Ver más información"
                                aria-label="Ver más información"
                                className="btn-outline px-2 text-secondary"
                              >
                                ⓘ
                              </button>
                              <Link to={`/concursos/cph/${c.id}/wizard`} className="btn-outline">
                                Ver
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn-outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
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
      {showFlujo && <FlujoConcursoModal onClose={() => setShowFlujo(false)} />}
      {detalle && <DetalleConcursoModal concurso={detalle} onClose={() => setDetalle(null)} />}

      {/* Drawer de filtros avanzados — mismo patrón visual que /dotacion */}
      {drawerAvanzado && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAvanzado(false)} />
          <div className="relative bg-white w-full max-w-sm h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-primary text-base font-bold text-gray-900">
                Filtros avanzados
              </h2>
              <button
                onClick={() => setDrawerAvanzado(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Etiquetas
                </p>
                <MultiSelectDropdown
                  label="Etiquetas"
                  value={etiquetasFiltro}
                  options={catalogoEtiquetas.map((et) => et.nombre)}
                  onChange={(v) => resetPage(setEtiquetasFiltro)(v)}
                  className="w-full"
                />
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Sub-estado
                </p>
                <select
                  value={subEstado}
                  onChange={(e) => resetPage(setSubEstado)(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todos los sub-estados</option>
                  {SUB_ESTADO_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Etapa
                </p>
                <select
                  value={subEstado3}
                  onChange={(e) => resetPage(setSubEstado3)(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todas las etapas</option>
                  {SUB_ESTADO_3_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Documentación respaldatoria
                </p>
                <select
                  value={origen}
                  onChange={(e) =>
                    resetPage(setOrigen)(e.target.value as '' | 'baja' | 'ampliacion' | 'cobertura')
                  }
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Toda respaldatoria</option>
                  <option value="baja">Baja</option>
                  <option value="ampliacion">Ampliación</option>
                  <option value="cobertura">Cobertura de dotación</option>
                </select>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Persona del orden de mérito
                </p>
                <select
                  value={personaOm}
                  onChange={(e) =>
                    resetPage(setPersonaOm)(e.target.value as '' | 'true' | 'false')
                  }
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todos</option>
                  <option value="true">Con persona elegida</option>
                  <option value="false">Sin persona elegida</option>
                </select>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Validado contra el padrón
                </p>
                <select
                  value={validado}
                  onChange={(e) =>
                    resetPage(setValidado)(e.target.value as '' | 'true' | 'false')
                  }
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todos</option>
                  <option value="true">Validados</option>
                  <option value="false">Sin validar</option>
                </select>
              </section>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
              {(subEstado ||
                subEstado3 ||
                origen ||
                personaOm ||
                validado ||
                etiquetasFiltro.length > 0) && (
                <button
                  onClick={() => {
                    resetPage(setSubEstado)('')
                    resetPage(setSubEstado3)('')
                    resetPage(setOrigen)('')
                    resetPage(setPersonaOm)('')
                    resetPage(setValidado)('')
                    resetPage(setEtiquetasFiltro)([])
                  }}
                  className="flex-1 btn-outline text-danger border-danger hover:bg-danger/5"
                >
                  Limpiar filtros
                </button>
              )}
              <button onClick={() => setDrawerAvanzado(false)} className="flex-1 btn-primary">
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastUI}
    </div>
  )
}

// Modal de detalle: muestra la información del concurso que no entra en la
// tabla (escalafón, cargo, hospital completo, persona, expedientes, etc.).
function DetalleConcursoModal({
  concurso: c,
  onClose,
}: {
  concurso: ConcursoCph
  onClose: () => void
}) {
  const r = respaldatoria(c)
  const dias = diasSinMovimiento(c.updatedAt)
  const filas: { label: string; valor: string }[] = [
    { label: 'Escalafón', valor: 'CPH' },
    {
      label: 'Cargo (código)',
      valor: c.concurso?.cargo?.codigo ?? c.concurso?.cargo?.literalPuesto ?? '—',
    },
    { label: 'Puesto', valor: c.puestoSolicitado ?? c.concurso?.cargo?.literalPuesto ?? '—' },
    {
      label: 'Especialidad',
      valor:
        c.especialidadSolicitada ??
        c.concurso?.cargo?.especialidadLegacy ??
        c.concurso?.cargo?.especialidad ??
        '—',
    },
    { label: 'Hospital', valor: c.hospital?.nombre ?? c.hospital?.sigla ?? '—' },
    { label: 'Persona (baja)', valor: c.concurso?.persona?.apellidoNombre ?? 'Vacante' },
    { label: 'Respaldatoria', valor: `${r.tipo}${r.expediente ? ` — ${r.expediente}` : ''}` },
    { label: 'Expediente de concurso', valor: c.eeConcurso ?? '—' },
    { label: 'Disposición', valor: c.disposicion ?? '—' },
    { label: 'Tipo de gestión', valor: c.tipoGestion ?? '—' },
    { label: 'Sub-estado', valor: c.subEstado ?? '—' },
    { label: 'Etapa (sub-estado 3)', valor: c.subEstado3 ?? '—' },
    { label: 'Últ. movimiento', valor: dias === 0 ? 'Hoy' : `hace ${dias} días` },
  ]
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="font-primary text-base font-bold text-gray-900">Detalle del concurso</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <dl className="divide-y divide-gray-100 text-sm">
            {filas.map((f) => (
              <div key={f.label} className="flex gap-4 py-2">
                <dt className="w-44 shrink-0 text-gray-500">{f.label}</dt>
                <dd className="text-gray-800">{f.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <Link to={`/concursos/cph/${c.id}/wizard`} className="btn-primary text-sm">
            Abrir concurso
          </Link>
          <button onClick={onClose} className="btn-outline text-sm">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
