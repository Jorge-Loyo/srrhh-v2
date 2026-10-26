import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoConcursoCph } from '@srrhh/types'
import type { ConcursoCph, ConcursoCphFilters } from '@srrhh/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import {
  useHospitales,
  useEscalafones,
  usePuestosCargoNormalizados,
  useEspecialidadesDePuestoId,
} from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { capitalizar } from '@/shared/lib/utils'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { MultiSelectDropdown } from '@/shared/components/ui/MultiSelectDropdown'
import { useConcursosCph } from '../hooks/useConcursosCph'
import { useEtiquetas, useAsignarEtiqueta, useCrearEtiqueta } from '../hooks/useEtiquetas'
import { FlujoConcursoModal } from '../components/FlujoConcursoModal'
import { EtiquetasControl } from '../components/EtiquetasControl'
import { JuradosTab } from '../components/JuradosTab'
import { OrdenesMeritoTab } from '../components/OrdenesMeritoTab'
import { JornadasSorteoTab } from '../components/JornadasSorteoTab'
import { apiClient } from '@/shared/lib/api-client'
import { useToast } from '@/shared/components/ui/useToast'
import {
  ESTADO_LABEL,
  SUB_ESTADO_OPTIONS,
  subEstadoLabel,
  subEstado3Label,
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

// Mapeo etapa (2..5) → sub_estados que la componen. Única fuente de verdad del
// mapeo etapa↔sub_estado: la usan tanto etapaActual() (stepper visual) como el
// filtro "Etapa" (que manda `etapa` al back). La etapa 1 NO se enumera: es el
// complemento (vacante, no iniciado, a-caratulado y cualquier sub_estado no
// listado o null). Si se agrega un sub_estado nuevo, va acá y filtro+stepper
// quedan sincronizados. El back replica este mismo mapeo (ver etapasSubEstados
// en concursos-cph.service.ts) — mantener ambos en sync; el test lo verifica.
const SUB_ESTADOS_POR_ETAPA: Record<2 | 3 | 4 | 5, string[]> = {
  2: ['a-autzn', 'b-sorteo jur', 'c-dispo de llamado'],
  3: ['c2-inscripcion ex', 'd-examen publicado', 'e-orden de merito'],
  4: ['f-ifacs', 'g-insal'],
  5: [
    'h-tad',
    'i-carga docu',
    'j-apto med',
    'k-ite',
    'l-pycto de reso',
    'm-reso a la firma',
    'n-designado',
    'o-alta sial',
    'q-desierto',
  ],
}

// Mapea el subEstado (con su prefijo de letra) al número de etapa 1..5.
function etapaActual(subEstado: string | null): number {
  // El sub_estado llega de la BD en minúscula; se normaliza el lado del dato
  // (defensivo ante datos legacy) y se compara contra literales en minúscula.
  const s = (subEstado ?? '').toLowerCase()
  for (const etapa of [2, 3, 4, 5] as const) {
    if (SUB_ESTADOS_POR_ETAPA[etapa].includes(s)) return etapa
  }
  return 1 // vacante, no iniciado, a-caratulado y cualquier otro/null
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

type TabId = 'concursos' | 'jurados' | 'ordenes' | 'jornadas'

// Contenedor con pestañas: Concursos (listado) | Jurados | Órdenes de mérito.
export function ConcursosCphPage() {
  const [tab, setTab] = useState<TabId>('concursos')

  const tabs: { id: TabId; label: string }[] = [
    { id: 'concursos', label: 'Concursos' },
    { id: 'jurados', label: 'Jurados' },
    { id: 'ordenes', label: 'Órdenes de mérito' },
    { id: 'jornadas', label: 'Jornada de sorteos' },
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
      {tab === 'jornadas' && <JornadasSorteoTab />}
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
  // Filtro por ETAPA (1..5 del stepper), reemplaza al viejo filtro por
  // subEstado3. '' = todas. Filtra por sub_estado vía el param `etapa` al back.
  const [etapa, setEtapa] = useState<'' | 1 | 2 | 3 | 4 | 5>('')
  const [origen, setOrigen] = useState<'' | 'baja' | 'ampliacion' | 'cobertura'>('')
  // Etapa 5: '' = todos, 'true' = con persona / validados, 'false' = sin.
  const [personaOm, setPersonaOm] = useState<'' | 'true' | 'false'>('')
  const [validado, setValidado] = useState<'' | 'true' | 'false'>('')
  const [puesto, setPuesto] = useState('')
  // Id del puesto elegido en el catálogo. Estado SOLO-UI: habilita y alimenta
  // la especialidad dependiente (useEspecialidadesDePuestoId). NO viaja al
  // backend — el back sigue filtrando por `puesto` (nombre string).
  const [puestoCargoId, setPuestoCargoId] = useState('')
  const [conduccion, setConduccion] = useState<'' | 'true' | 'false'>('')
  const [etiquetasFiltro, setEtiquetasFiltro] = useState<string[]>([]) // nombres de etiqueta
  // Ordenamiento por fecha. DEFAULT: fecha de expediente, descendente (más
  // reciente primero), alineado con el default del backend.
  const [ordenarPor, setOrdenarPor] = useState<'fecha_ee_concurso' | 'fecha_baja'>(
    'fecha_ee_concurso',
  )
  const [orden, setOrden] = useState<'asc' | 'desc'>('desc')
  // Rangos de fecha (YYYY-MM-DD), independientes: baja y expediente de concurso.
  const [fechaBajaDesde, setFechaBajaDesde] = useState('')
  const [fechaBajaHasta, setFechaBajaHasta] = useState('')
  const [fechaEeConcursoDesde, setFechaEeConcursoDesde] = useState('')
  const [fechaEeConcursoHasta, setFechaEeConcursoHasta] = useState('')
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
  const puestoDebounced = useDebounce(puesto, 300)

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
    ...(puestoDebounced && { puesto: puestoDebounced }),
    ...(conduccion && { conduccion: conduccion === 'true' }),
    ...(hospitalId && { hospitalId }),
    ...(estado && { estado }),
    ...(subEstado && { subEstado }),
    ...(etapa !== '' && { etapa }),
    ...(origen && { origen }),
    ...(conFaltantes && { conFaltantes: true }),
    ...(personaOm && { personaOm: personaOm === 'true' }),
    ...(validado && { validado: validado === 'true' }),
    ordenarPor,
    orden,
    ...(fechaBajaDesde && { fechaBajaDesde }),
    ...(fechaBajaHasta && { fechaBajaHasta }),
    ...(fechaEeConcursoDesde && { fechaEeConcursoDesde }),
    ...(fechaEeConcursoHasta && { fechaEeConcursoHasta }),
    ...(etiquetasFiltro.length && {
      etiquetaIds: etiquetasFiltro
        .map((nombre) => catalogoEtiquetas.find((e) => e.nombre === nombre)?.id)
        .filter((x): x is string => !!x)
        .join(','),
    }),
  }

  const { data, isLoading, isFetching, isError } = useConcursosCph(filters)
  const { data: hospitales } = useHospitales()

  // Catálogo de puestos CPH para el autocompletar del filtro "Puesto".
  // Se acota al escalafón CPH (igual que el wizard y FiltrosCatalogo): sin
  // escalafonId el hook no trae nada (query enabled: !!escalafonId).
  const { data: escalafones = [] } = useEscalafones(true)
  const escalafonCphId = escalafones.find(
    (e) => e.nombre === 'Nueva Carrera Profesional Hospitalaria',
  )?.id
  const { data: puestosCatalogo = [] } = usePuestosCargoNormalizados(escalafonCphId || undefined)
  // Especialidades del puesto EXACTO por id (preferido en filtros: evita el bug
  // de puestos homónimos). Alimenta el combo de Especialidad dependiente.
  const { data: especialidadesPuesto = [] } = useEspecialidadesDePuestoId(
    puestoCargoId || undefined,
  )

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
          {/* Ordenamiento por fecha: columna + dirección (default fecha de
              expediente, más reciente primero). */}
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">
              Ordenar por
            </label>
            <select
              value={ordenarPor}
              onChange={(e) =>
                resetPage(setOrdenarPor)(e.target.value as 'fecha_ee_concurso' | 'fecha_baja')
              }
              aria-label="Ordenar por fecha"
              className="h-8 px-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="fecha_ee_concurso">Fecha de expediente</option>
              <option value="fecha_baja">Fecha de baja</option>
            </select>
            <select
              value={orden}
              onChange={(e) => resetPage(setOrden)(e.target.value as 'asc' | 'desc')}
              aria-label="Dirección del orden"
              className="h-8 px-2 border border-gray-300 rounded text-xs focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="desc">Más reciente primero</option>
              <option value="asc">Más antiguo primero</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => setDrawerAvanzado(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 text-gray-600 hover:border-secondary hover:text-secondary transition-colors"
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
              etapa !== '' ||
              origen ||
              personaOm ||
              validado ||
              puesto ||
              conduccion ||
              fechaBajaDesde ||
              fechaBajaHasta ||
              fechaEeConcursoDesde ||
              fechaEeConcursoHasta ||
              etiquetasFiltro.length > 0) && (
              <span className="bg-secondary/20 text-secondary text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {[
                  subEstado,
                  etapa !== '',
                  origen,
                  personaOm,
                  validado,
                  puesto,
                  conduccion,
                  fechaBajaDesde,
                  fechaBajaHasta,
                  fechaEeConcursoDesde,
                  fechaEeConcursoHasta,
                ].filter(Boolean).length + (etiquetasFiltro.length > 0 ? 1 : 0)}
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
          if (puestoDebounced)
            chips.push({
              label: `Puesto: "${puestoDebounced}"`,
              onClear: () => {
                setPuesto('')
                setPuestoCargoId('')
                setEspecialidad('')
              },
            })
          if (conduccion)
            chips.push({
              label: conduccion === 'true' ? 'Cargo de conducción' : 'Cargo de ejecución',
              onClear: () => resetPage(setConduccion)(''),
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
              label: `Sub-estado: ${subEstadoLabel(subEstado)}`,
              onClear: () => resetPage(setSubEstado)(''),
            })
          if (etapa !== '')
            chips.push({
              label: `Etapa: ${ETAPAS[etapa - 1]}`,
              onClear: () => resetPage(setEtapa)(''),
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
          if (fechaBajaDesde || fechaBajaHasta)
            chips.push({
              label: `Fecha de baja: ${fechaBajaDesde || '…'} → ${fechaBajaHasta || '…'}`,
              onClear: () => {
                resetPage(setFechaBajaDesde)('')
                setFechaBajaHasta('')
              },
            })
          if (fechaEeConcursoDesde || fechaEeConcursoHasta)
            chips.push({
              label: `Fecha de expediente: ${fechaEeConcursoDesde || '…'} → ${fechaEeConcursoHasta || '…'}`,
              onClear: () => {
                resetPage(setFechaEeConcursoDesde)('')
                setFechaEeConcursoHasta('')
              },
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
                  setEtapa('')
                  setOrigen('')
                  setConFaltantes(false)
                  setPersonaOm('')
                  setValidado('')
                  setPuesto('')
                  setPuestoCargoId('')
                  setConduccion('')
                  setFechaBajaDesde('')
                  setFechaBajaHasta('')
                  setFechaEeConcursoDesde('')
                  setFechaEeConcursoHasta('')
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
                      <th className="px-4 py-3 font-semibold">Repartición</th>
                      <th className="px-4 py-3 font-semibold">Etapa</th>
                      <th className="px-4 py-3 font-semibold">Sub-estado</th>
                      <th className="px-4 py-3 font-semibold">Motivo</th>
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
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {c.concurso?.cargo?.descripcionRepa ?? c.concurso?.cargo?.codigoRepa ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <EtapaStepper subEstado={c.subEstado} />
                          </td>
                          <td className="px-4 py-3 text-gray-600">{subEstadoLabel(c.subEstado)}</td>
                          <td className="px-4 py-3">
                            {c.concurso?.motivoConcurso === 'nuevo_cargo' && (
                              <span className="badge-info text-xs">Nuevo cargo</span>
                            )}
                            {c.concurso?.motivoConcurso === 'alta_por_baja' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Alta por baja</span>
                            )}
                          </td>
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
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Etapa
                </p>
                <select
                  value={etapa}
                  onChange={(e) =>
                    resetPage(setEtapa)(e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5))
                  }
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todas las etapas</option>
                  {ETAPAS.map((nombre, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}. {nombre}
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

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Puesto
                </p>
                {/* Autocompletar contra el catálogo CPH: solo puestos mapeados
                    (SearchableSelect solo emite onChange al elegir una opción).
                    El estado `puesto` guarda el NOMBRE crudo del catálogo (el
                    mismo string que viaja al backend); `puestoCargoId` guarda
                    el id para habilitar/poblar la especialidad dependiente. */}
                <SearchableSelect
                  value={puesto}
                  onChange={(nombre) => {
                    resetPage(setPuesto)(nombre)
                    setPuestoCargoId(
                      puestosCatalogo.find(
                        (p) => p.nombre === nombre || capitalizar(p.nombre) === nombre,
                      )?.id ?? '',
                    )
                    // Al cambiar de puesto, limpiar la especialidad dependiente.
                    resetPage(setEspecialidad)('')
                  }}
                  options={puestosCatalogo.map((p) => capitalizar(p.nombre))}
                  valueToDisplay={(v) =>
                    capitalizar(
                      puestosCatalogo.find((p) => p.nombre === v || capitalizar(p.nombre) === v)
                        ?.nombre,
                    ) || v
                  }
                  displayToValue={(label) =>
                    puestosCatalogo.find((p) => capitalizar(p.nombre) === label)?.nombre ?? label
                  }
                  placeholder={escalafonCphId ? 'Buscar puesto…' : 'Catálogo no disponible'}
                  disabled={!escalafonCphId}
                  className="w-full"
                />
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Especialidad del puesto
                </p>
                {/* Especialidad DEPENDIENTE del puesto elegido. Deshabilitada
                    hasta elegir un puesto o si el puesto no tiene especialidades
                    en el catálogo. Escribe sobre el MISMO estado `especialidad`
                    (nombre string) que viaja al backend. */}
                <SearchableSelect
                  value={especialidad}
                  onChange={(nombre) => resetPage(setEspecialidad)(nombre)}
                  options={especialidadesPuesto.map((e) => capitalizar(e.nombre))}
                  valueToDisplay={(v) =>
                    capitalizar(
                      especialidadesPuesto.find(
                        (e) => e.nombre === v || capitalizar(e.nombre) === v,
                      )?.nombre,
                    ) || v
                  }
                  displayToValue={(label) =>
                    especialidadesPuesto.find((e) => capitalizar(e.nombre) === label)?.nombre ??
                    label
                  }
                  placeholder={
                    !puestoCargoId
                      ? 'Elegí un puesto primero'
                      : especialidadesPuesto.length === 0
                        ? 'El puesto no tiene especialidades'
                        : 'Todas las especialidades'
                  }
                  disabled={!puestoCargoId || especialidadesPuesto.length === 0}
                  className="w-full"
                />
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Fecha de baja
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Desde</span>
                    <input
                      type="date"
                      value={fechaBajaDesde}
                      onChange={(e) => resetPage(setFechaBajaDesde)(e.target.value)}
                      className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Hasta</span>
                    <input
                      type="date"
                      value={fechaBajaHasta}
                      onChange={(e) => resetPage(setFechaBajaHasta)(e.target.value)}
                      className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                    />
                  </label>
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Fecha de expediente de concurso
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Desde</span>
                    <input
                      type="date"
                      value={fechaEeConcursoDesde}
                      onChange={(e) => resetPage(setFechaEeConcursoDesde)(e.target.value)}
                      className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 mb-1">Hasta</span>
                    <input
                      type="date"
                      value={fechaEeConcursoHasta}
                      onChange={(e) => resetPage(setFechaEeConcursoHasta)(e.target.value)}
                      className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                    />
                  </label>
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Tipo de cargo
                </p>
                <select
                  value={conduccion}
                  onChange={(e) =>
                    resetPage(setConduccion)(e.target.value as '' | 'true' | 'false')
                  }
                  className="w-full h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  <option value="">Todos</option>
                  <option value="true">Conducción (jefaturas/dirección)</option>
                  <option value="false">Ejecución</option>
                </select>
              </section>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
              {(subEstado ||
                etapa !== '' ||
                origen ||
                personaOm ||
                validado ||
                puesto ||
                conduccion ||
                fechaBajaDesde ||
                fechaBajaHasta ||
                fechaEeConcursoDesde ||
                fechaEeConcursoHasta ||
                etiquetasFiltro.length > 0) && (
                <button
                  onClick={() => {
                    resetPage(setSubEstado)('')
                    resetPage(setEtapa)('')
                    resetPage(setOrigen)('')
                    resetPage(setPersonaOm)('')
                    resetPage(setValidado)('')
                    resetPage(setPuesto)('')
                    setPuestoCargoId('')
                    resetPage(setEspecialidad)('')
                    resetPage(setConduccion)('')
                    resetPage(setFechaBajaDesde)('')
                    setFechaBajaHasta('')
                    resetPage(setFechaEeConcursoDesde)('')
                    setFechaEeConcursoHasta('')
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
    { label: 'Carrera', valor: 'CPH' },
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
    { label: 'Sub-estado', valor: subEstadoLabel(c.subEstado) },
    { label: 'Etapa (sub-estado 3)', valor: subEstado3Label(c.subEstado3) },
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
