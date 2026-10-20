// Mudado desde `modules/kpis/components/EvolucionEspecialidadChart.tsx`
// (Opción A del plan): la sección "Evolución de dotación" ahora vive en
// Reportes. Único ajuste de imports: los tres hooks se resuelven desde
// `../hooks/useReportes` (antes `../hooks/useKpis`); el resto queda igual.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KpiDotacionEvolucion, PerfilIndicadorEvolucion } from '@srrhh/types'
import { ORDEN_SITUACION_REVISTA } from '@srrhh/types'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import {
  useDotacionEvolucion,
  useDotacionEvolucionOpciones,
  useExportDotacionEvolucion,
} from '../hooks/useReportes'
import {
  CLAVE_TOTAL,
  CLAVE_ACTIVOS_Y_COMISIONADOS,
  estiloSerie,
  ordenarSituaciones,
  etiquetaSituacion,
  asignarColorIndicador,
  colorIndicador,
  type EstiloSerie,
} from '../lib/situacion-revista'

// Un indicador comparable congelado en el front (punto 3): sus 5 dimensiones +
// situación de revista, más la etiqueta legible ya joineada y su color
// persistido (estable, no se recalcula al quitar otros indicadores).
interface IndicadorUI {
  id: string
  siglas: string[]
  carreras: string[]
  puestos: string[]
  especialidades: string[]
  gruposEspecialidad: string[]
  situaciones: string[]
  label: string
  color: EstiloSerie
}

// ─── Dimensiones del gráfico ────────────────────────────────────────────────
const W = 720
const H = 260
const P = { top: 20, right: 60, bottom: 34, left: 56 }
const innerW = W - P.left - P.right
const innerH = H - P.top - P.bottom

// Color tenue del área bajo la línea total (el color real de cada serie lo
// resuelve el módulo compartido `situacion-revista`).
const COLOR_LIGHT = '#DBEAFE'

function techoLimpio(max: number): number {
  if (max <= 0) return 10
  const mag = 10 ** Math.floor(Math.log10(max))
  for (const p of [1, 2, 2.5, 5, 10]) {
    if (p * mag >= max) return p * mag
  }
  return 10 * mag
}

// Rango Y: si la variación relativa es baja, se ajusta al mínimo para que la
// curva no se vea plana. Mismo criterio que EvolucionDotacionChart.
function calcularRangoY(valores: number[]): { yMin: number; yMax: number } {
  const vals = valores.filter((v) => v > 0)
  if (vals.length === 0) return { yMin: 0, yMax: 10 }
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const rango = max - min
  if (rango / max > 0.3) return { yMin: 0, yMax: techoLimpio(max) }
  const padding = Math.max(rango * 0.5, max * 0.005)
  return { yMin: Math.floor(min - padding), yMax: Math.ceil(max + padding) }
}

function formatNum(n: number): string {
  return n.toLocaleString('es-AR')
}

// 'YYYY-MM' → 'ene 26'
function formatMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y!, (m ?? 1) - 1, 1)
  return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

// 'YYYY-MM' → 'Enero 2026' (para los selectores de rango)
function formatMesLargo(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y!, (m ?? 1) - 1, 1)
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// El backend devuelve puesto/especialidad en MAYÚSCULAS (clave canónica
// normalizada). Para el desplegable se muestra en Capitalización De Palabras,
// respetando siglas entre paréntesis como "(04)".
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\p{L}/gu, (ch) => ch.toUpperCase())
}

// ─── MultiCombobox escribible ───────────────────────────────────────────────
// Select múltiple con búsqueda: se escribe para filtrar, se tildan varias
// opciones y se muestran como chips. value/label pueden diferir (value = clave
// canónica). Los valores ya seleccionados se marcan y se pueden quitar.
interface ComboOption {
  value: string
  label: string
}

function MultiCombobox({
  label,
  options,
  selected,
  onChange,
  placeholder,
  disabled,
}: {
  label: string
  options: ComboOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const labelDe = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]))
    return (v: string) => m.get(v) ?? v
  }, [options])

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  function toggle(v: string) {
    if (selectedSet.has(v)) onChange(selected.filter((s) => s !== v))
    else onChange([...selected, v])
  }

  // "Todos" opera sobre las opciones actualmente filtradas por la búsqueda; sin
  // búsqueda, sobre todas. Une con lo ya elegido para no perder selección previa.
  function seleccionarTodos() {
    const visibles = filtradas.map((o) => o.value)
    onChange([...new Set([...selected, ...visibles])])
  }
  function deseleccionarTodos() {
    const visibles = new Set(filtradas.map((o) => o.value))
    onChange(selected.filter((s) => !visibles.has(s)))
  }

  return (
    <div className="relative" ref={boxRef}>
      <label className="block text-xs text-gray-500 mb-1">
        {label}
        {selected.length > 0 && <span className="text-secondary font-semibold"> ({selected.length})</span>}
      </label>

      <input
        type="text"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => !disabled && setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary disabled:bg-gray-100"
      />

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg text-sm">
          {/* Acciones masivas */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
            <button type="button" onClick={seleccionarTodos} className="text-secondary hover:underline">
              Seleccionar todos{query ? ' (filtrados)' : ''}
            </button>
            <button type="button" onClick={deseleccionarTodos} className="text-gray-500 hover:underline">
              Ninguno
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtradas.map((o) => {
              const on = selectedSet.has(o.value)
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={`flex w-full items-center gap-2 text-left px-3 py-2 hover:bg-gray-50 ${on ? 'font-semibold text-secondary' : 'text-gray-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 flex-shrink-0 rounded border ${on ? 'bg-secondary border-secondary text-white' : 'border-gray-300'}`}>
                      {on && <span className="block text-center text-xs leading-4">✓</span>}
                    </span>
                    {o.label}
                  </button>
                </li>
              )
            })}
            {filtradas.length === 0 && <li className="px-3 py-2 text-gray-400">Sin coincidencias</li>}
          </ul>
        </div>
      )}

      {/* Chips de lo seleccionado — debajo del input para no desalinear la grilla */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded px-2 py-0.5"
            >
              {labelDe(v)}
              <button
                type="button"
                onClick={() => toggle(v)}
                className="text-blue-400 hover:text-blue-700"
                aria-label={`Quitar ${labelDe(v)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const listaVacia: string[] = []
const listaVaciaCarreras: { codigo: string; literal: string }[] = []

// Estado de las dimensiones del filtro (lo que el usuario está editando).
interface EstadoFiltros {
  siglas: string[]
  carreras: string[]
  puestos: string[]
  especialidades: string[]
  gruposEspecialidad: string[]
  situaciones: string[]
  mesDesde: string
  mesHasta: string
  indicadores: IndicadorUI[]
}

const ESTADO_INICIAL: EstadoFiltros = {
  siglas: [], carreras: [], puestos: [], especialidades: [], gruposEspecialidad: [],
  situaciones: [], mesDesde: '', mesHasta: '', indicadores: [],
}

// id estable para un indicador: crypto.randomUUID() con fallback a un contador
// monotónico cuando la API no está disponible.
let _indicadorSeq = 0
function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  _indicadorSeq += 1
  return `ind-${Date.now()}-${_indicadorSeq}`
}

// Un IndicadorUI → el perfil que viaja al backend (id + 5 dimensiones +
// situaciones). NO manda color/label/labels: el front re-asocia color/label por
// id contra su estado local.
function toPerfil(ind: IndicadorUI): PerfilIndicadorEvolucion {
  const p: PerfilIndicadorEvolucion = { id: ind.id }
  if (ind.siglas.length) p.siglas = ind.siglas
  if (ind.carreras.length) p.carreras = ind.carreras
  if (ind.puestos.length) p.puestos = ind.puestos
  if (ind.especialidades.length) p.especialidades = ind.especialidades
  if (ind.gruposEspecialidad.length) p.gruposEspecialidad = ind.gruposEspecialidad
  if (ind.situaciones.length) p.situaciones = ind.situaciones
  return p
}

export function EvolucionEspecialidadChart() {
  // ── Estado EN EDICIÓN: lo que el usuario toca en los combos. NO dispara
  //    consultas al backend por sí solo (Opción A: todo congelado hasta Aplicar).
  const [siglas, setSiglas] = useState<string[]>([])
  const [carreras, setCarreras] = useState<string[]>([])
  const [puestos, setPuestos] = useState<string[]>([])
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [gruposEspecialidad, setGruposEspecialidad] = useState<string[]>([])
  const [situaciones, setSituaciones] = useState<string[]>([])
  const [mesDesde, setMesDesde] = useState('')
  const [mesHasta, setMesHasta] = useState('')
  // Indicadores comparables: perfiles congelados con "+ Unión". Cada uno es una
  // línea independiente del gráfico.
  const [indicadores, setIndicadores] = useState<IndicadorUI[]>([])

  // ── Estado APLICADO: la "foto" que se mandó al backend. Opciones, serie y
  //    export leen SOLO de acá. Cambia únicamente al tocar "Aplicar" o al fijar
  //    una unión. Evita re-consultar en cada tecla/selección.
  const [aplicado, setAplicado] = useState<EstadoFiltros>(ESTADO_INICIAL)

  // Filtros en edición (para armar el próximo "Aplicar"/Unión).
  const edicion: EstadoFiltros = {
    siglas, carreras, puestos, especialidades, gruposEspecialidad, situaciones, mesDesde, mesHasta, indicadores,
  }

  // GRÁFICO + EXPORT: usan el estado APLICADO (la consulta pesada corre solo al
  // tocar "Aplicar").
  const filtros = {
    siglas: aplicado.siglas,
    carreras: aplicado.carreras,
    puestos: aplicado.puestos,
    especialidades: aplicado.especialidades,
    gruposEspecialidad: aplicado.gruposEspecialidad.length ? aplicado.gruposEspecialidad : undefined,
    situaciones: aplicado.situaciones.length ? aplicado.situaciones : undefined,
    mesDesde: aplicado.mesDesde || undefined,
    mesHasta: aplicado.mesHasta || undefined,
    indicadores: aplicado.indicadores.length ? aplicado.indicadores.map(toPerfil) : undefined,
  }

  // DESPLEGABLES (facetado): usan el estado EN EDICIÓN, para que al elegir en un
  // combo los demás se re-filtren en vivo con lo que queda compatible. Es una
  // consulta liviana; la pesada (serie) espera al "Aplicar".
  const filtrosEdicion = {
    siglas,
    carreras,
    puestos,
    especialidades,
    gruposEspecialidad: gruposEspecialidad.length ? gruposEspecialidad : undefined,
    // La situación de revista no acota el facetado (el backend ignora
    // `situaciones` en opciones); se envía igual para que el contrato sea
    // consistente, pero NO recorta las demás dimensiones.
    situaciones: situaciones.length ? situaciones : undefined,
    // El rango de meses no acota el facetado de dimensiones; se omite acá.
    // `indicadores` NO se manda a opciones (el facetado nunca los ve).
  }

  // ¿El estado en edición difiere del aplicado? (habilita el botón Aplicar)
  const hayCambiosSinAplicar = useMemo(
    () => JSON.stringify(edicion) !== JSON.stringify(aplicado),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siglas, carreras, puestos, especialidades, gruposEspecialidad, situaciones, mesDesde, mesHasta, indicadores, aplicado]
  )

  function aplicarFiltros() {
    setAplicado({ ...edicion })
  }

  const { data: hospitales } = useHospitales()
  // Opciones facetadas: sobre el estado EN EDICIÓN (dinámicas en vivo).
  const { data: opciones, isLoading: loadingOpciones } = useDotacionEvolucionOpciones(filtrosEdicion)
  // Serie: sobre el estado APLICADO (solo cambia al Aplicar).
  const { data: serie, isFetching } = useDotacionEvolucion(filtros)
  const exportar = useExportDotacionEvolucion()

  // Mapa sigla → nombre de hospital (como en /cargos) para etiquetar el efector.
  const nombrePorSigla = useMemo(() => {
    const m = new Map<string, string>()
    for (const h of hospitales ?? []) m.set(h.sigla, h.nombre)
    return m
  }, [hospitales])

  // Mapea claves canónicas a {value, label} legible.
  const siglaOpts = useMemo<ComboOption[]>(
    () =>
      (opciones?.siglas ?? listaVacia).map((s) => {
        const nombre = nombrePorSigla.get(s)
        return { value: s, label: nombre ? `${s} — ${nombre}` : s }
      }),
    [opciones, nombrePorSigla]
  )
  // Combo "Carrera": value = CÓDIGO de registro, label = "{codigo} — {literal}"
  // para distinguir carreras homónimas (ej. 37 vs 22, ambas "Nueva Carrera
  // Profesional Hospitalaria"). Ordenadas alfabéticamente por el label.
  const carreraOpts = useMemo<ComboOption[]>(
    () =>
      (opciones?.carreras ?? listaVaciaCarreras)
        .map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.literal}` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true })),
    [opciones]
  )
  // Mapa codigo→"{codigo} — {literal}" para resolver labels (chips de unión
  // incluidos), consistente con el combo de Carrera.
  const literalPorCodigo = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of opciones?.carreras ?? listaVaciaCarreras) m.set(c.codigo, `${c.codigo} — ${c.literal}`)
    return (codigo: string) => m.get(codigo) ?? codigo
  }, [opciones])
  const puestoOpts = useMemo<ComboOption[]>(
    () => (opciones?.puestos ?? listaVacia).map((p) => ({ value: p, label: titleCase(p) })),
    [opciones]
  )
  const especialidadOpts = useMemo<ComboOption[]>(
    () =>
      (opciones?.especialidades ?? listaVacia).map((esp) => ({
        value: esp,
        label: esp === '(sin especialidad)' ? 'Sin especialidad' : titleCase(esp),
      })),
    [opciones]
  )
  // S25: grupos de especialidad disponibles. El combo "Grupos" solo se muestra
  // si hay alguno (si la selección actual no tiene especialidades agrupadas,
  // la lista viene vacía y el campo desaparece).
  const grupoOpts = useMemo<ComboOption[]>(
    () => (opciones?.gruposEspecialidad ?? listaVacia).map((g) => ({ value: g, label: g })),
    [opciones]
  )
  const hayGrupos = grupoOpts.length > 0
  const meses = opciones?.meses ?? listaVacia

  // Rango válido: "hasta" no puede ser menor que "desde".
  const mesesHasta = useMemo(
    () => (mesDesde ? meses.filter((m) => m >= mesDesde) : meses),
    [meses, mesDesde]
  )
  const mesesDesde = useMemo(
    () => (mesHasta ? meses.filter((m) => m <= mesHasta) : meses),
    [meses, mesHasta]
  )

  // Opciones del combo "Situación de revista": catálogo cerrado local (no
  // facetado), derivado del orden canónico menos "(sin dato)".
  const situacionOpts = useMemo<ComboOption[]>(
    () =>
      ORDEN_SITUACION_REVISTA.filter((s) => s !== '(sin dato)').map((s) => ({
        value: s,
        label: etiquetaSituacion(s),
      })),
    []
  )

  // El gráfico, su título y el export dependen de lo APLICADO (lo que se graficó).
  const haySeleccion =
    aplicado.siglas.length + aplicado.carreras.length + aplicado.puestos.length +
    aplicado.especialidades.length + aplicado.gruposEspecialidad.length > 0 || aplicado.indicadores.length > 0
  // El botón Excel se habilita solo cuando hay ≥1 dimensión suelta aplicada
  // (el export ignora `indicadores`): si solo hay indicadores fijados, se oculta.
  const puedeExportar =
    aplicado.siglas.length + aplicado.carreras.length + aplicado.puestos.length +
    aplicado.especialidades.length + aplicado.gruposEspecialidad.length > 0
  const hayFiltroActivo =
    haySeleccion || Boolean(aplicado.mesDesde || aplicado.mesHasta) || hayCambiosSinAplicar
  const puntos = serie?.puntos ?? []

  // Series por indicador: re-asocia color/label por `id` contra el estado local
  // aplicado (el backend no reconstruye label y no conoce el color). Fallback a
  // color/label derivados del id si el indicador ya no está en el estado local.
  const indicadoresSerie = useMemo<IndicadorSerieUI[]>(() => {
    const series = serie?.indicadores ?? []
    if (series.length === 0) return []
    const porId = new Map(aplicado.indicadores.map((i) => [i.id, i]))
    return series.map((s) => {
      const local = porId.get(s.id)
      return {
        id: s.id,
        label: local?.label ?? (s.label || 'Indicador'),
        color: local?.color ?? colorIndicador(s.id),
        puntos: s.puntos,
      }
    })
  }, [serie, aplicado.indicadores])

  // ¿Hay algo para graficar? Modo desglose (puntos) o modo multi (indicadores).
  const tieneSerie = puntos.length > 0 || indicadoresSerie.length > 0

  function limpiar() {
    setSiglas([]); setCarreras([]); setPuestos([]); setEspecialidades([]); setGruposEspecialidad([])
    setSituaciones([]); setMesDesde(''); setMesHasta(''); setIndicadores([])
    setAplicado(ESTADO_INICIAL)
  }

  // ¿Hay un perfil en edición (dimensiones sueltas o situación) que fijar como
  // indicador?
  const hayPerfilEnEdicion =
    siglas.length + carreras.length + puestos.length + especialidades.length +
    gruposEspecialidad.length + situaciones.length > 0

  // Fija el perfil en edición (dimensiones + situación) como un indicador
  // comparable (con label legible y color persistido), limpia la cascada y
  // APLICA (congela y consulta).
  function agregarIndicador() {
    if (!hayPerfilEnEdicion || indicadores.length >= 8) return
    const id = nuevoId()
    const segmentos: string[] = []
    if (siglas.length) segmentos.push(siglas.join(' / '))
    if (carreras.length) segmentos.push(carreras.map(literalPorCodigo).join(' / '))
    if (puestos.length) segmentos.push(puestos.map(titleCase).join(' / '))
    if (especialidades.length) segmentos.push(especialidades.map(titleCase).join(' / '))
    if (gruposEspecialidad.length) segmentos.push(gruposEspecialidad.join(' / '))
    if (situaciones.length) segmentos.push(situaciones.map(etiquetaSituacion).join(' / '))
    const label = segmentos.length ? segmentos.join(' · ') : `Indicador ${indicadores.length + 1}`
    const color = asignarColorIndicador(id, indicadores.map((i) => i.color))
    const nuevo: IndicadorUI = {
      id, siglas, carreras, puestos, especialidades, gruposEspecialidad, situaciones, label, color,
    }
    const nuevosIndicadores = [...indicadores, nuevo]
    setIndicadores(nuevosIndicadores)
    setSiglas([]); setCarreras([]); setPuestos([]); setEspecialidades([]); setGruposEspecialidad([]); setSituaciones([])
    // Fijar el indicador aplica de inmediato: se consulta con el indicador ya
    // incorporado y la cascada en edición vacía.
    setAplicado({
      siglas: [], carreras: [], puestos: [], especialidades: [], gruposEspecialidad: [],
      situaciones: [], mesDesde, mesHasta, indicadores: nuevosIndicadores,
    })
  }

  function quitarIndicador(id: string) {
    const restantes = indicadores.filter((ind) => ind.id !== id)
    setIndicadores(restantes)
    // Quitar un indicador también re-aplica (el gráfico debe reflejarlo). No se
    // tocan los colores de los indicadores restantes.
    setAplicado((prev) => ({ ...prev, indicadores: restantes }))
  }

  return (
    <div className="space-y-4">
      {/* ── Filtros multivaluados (Hospitales → Carrera → Puesto → Especialidad) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        <MultiCombobox
          label="Efectores"
          options={siglaOpts}
          selected={siglas}
          disabled={loadingOpciones}
          placeholder="Buscar sigla o nombre…"
          onChange={setSiglas}
        />
        <MultiCombobox
          label="Carrera"
          options={carreraOpts}
          selected={carreras}
          disabled={loadingOpciones}
          placeholder="Buscar carrera…"
          onChange={setCarreras}
        />
        <MultiCombobox
          label="Puesto"
          options={puestoOpts}
          selected={puestos}
          disabled={loadingOpciones}
          placeholder="Buscar puesto…"
          onChange={setPuestos}
        />
        <MultiCombobox
          label="Especialidad"
          options={especialidadOpts}
          selected={especialidades}
          disabled={loadingOpciones}
          placeholder="Buscar especialidad…"
          onChange={setEspecialidades}
        />
        {/* S25: "Grupos" solo aparece si la selección actual tiene
            especialidades agrupadas (grupoOpts no vacío). */}
        {hayGrupos && (
          <MultiCombobox
            label="Grupos"
            options={grupoOpts}
            selected={gruposEspecialidad}
            disabled={loadingOpciones}
            placeholder="Buscar grupo…"
            onChange={setGruposEspecialidad}
          />
        )}
        {/* Situación de revista (punto 2): acota QUÉ personas entran en la
            reconstrucción del estado acumulado. Catálogo cerrado local. */}
        <MultiCombobox
          label="Situación de revista"
          options={situacionOpts}
          selected={situaciones}
          placeholder="Todas las situaciones…"
          onChange={setSituaciones}
        />
      </div>

      {/* ── Indicadores comparables: fijar el perfil actual como otra línea ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={agregarIndicador}
          disabled={!hayPerfilEnEdicion || indicadores.length >= 8}
          title={
            indicadores.length >= 8
              ? 'Máximo 8 indicadores'
              : 'Fijar los filtros de arriba como un indicador comparable (una línea del gráfico)'
          }
          className="h-8 px-3 rounded border border-secondary text-secondary text-xs font-semibold hover:bg-secondary/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Unión
        </button>
        {indicadores.length === 0 ? (
          <span className="text-xs text-gray-400">
            Combiná filtros (incluida la situación de revista) y tocá{' '}
            <span className="font-semibold">+ Unión</span> para sumar un indicador: cada uno es otra línea del
            gráfico (ej. “activos del código 37” vs. “retención de cargo del código 22”).
          </span>
        ) : (
          <>
            <span className="text-xs text-gray-400">Indicadores:</span>
            {indicadores.map((ind) => (
              <span
                key={ind.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: ind.color.colorLight, color: ind.color.color }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: ind.color.color }}
                />
                {ind.label}
                <button
                  type="button"
                  onClick={() => quitarIndicador(ind.id)}
                  className="ml-0.5 hover:opacity-60"
                  aria-label={`Quitar indicador ${ind.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {/* ── Rango de meses + jefaturas + limpiar ──────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <select
            value={mesDesde}
            onChange={(e) => setMesDesde(e.target.value)}
            className="h-9 px-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Inicio</option>
            {mesesDesde.map((m) => (
              <option key={m} value={m}>{formatMesLargo(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <select
            value={mesHasta}
            onChange={(e) => setMesHasta(e.target.value)}
            className="h-9 px-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Fin</option>
            {mesesHasta.map((m) => (
              <option key={m} value={m}>{formatMesLargo(m)}</option>
            ))}
          </select>
        </div>

        {/* Aplicar: manda la consulta al backend. Hasta tocarlo, los combos solo
            editan en memoria (no se re-consulta en cada selección). */}
        <button
          type="button"
          onClick={aplicarFiltros}
          disabled={!hayCambiosSinAplicar}
          title="Aplicar los filtros seleccionados y actualizar el gráfico"
          className="h-9 px-4 rounded bg-secondary text-white text-sm font-semibold hover:bg-secondary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Aplicar filtros
        </button>

        {hayFiltroActivo && (
          <button
            type="button"
            onClick={limpiar}
            className="text-sm text-gray-500 hover:text-gray-700 underline h-9"
          >
            Limpiar filtros
          </button>
        )}

        {puedeExportar && (
          <button
            type="button"
            onClick={() => exportar.mutate(filtros)}
            disabled={exportar.isPending}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {exportar.isPending ? 'Generando…' : '↓ Descargar Excel'}
          </button>
        )}
      </div>

      {hayCambiosSinAplicar && (
        <p className="text-xs text-amber-600">
          Hay cambios sin aplicar. Tocá <span className="font-semibold">Aplicar filtros</span> para actualizar el gráfico.
        </p>
      )}

      {/* ── Gráfico ───────────────────────────────────────────────────── */}
      {!haySeleccion ? (
        <p className="text-sm text-gray-400">
          {hayPerfilEnEdicion
            ? 'Tocá «Aplicar filtros» para calcular la evolución con la selección actual.'
            : 'Elegí al menos un filtro (efector, carrera, puesto, especialidad o situación) y tocá «Aplicar filtros» para ver la evolución mensual de la dotación.'}
        </p>
      ) : isFetching ? (
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      ) : !tieneSerie ? (
        <p className="text-sm text-gray-400">No hay datos de padrón para esta combinación.</p>
      ) : (
        <LineaEvolucion
          puntos={puntos}
          situaciones={serie?.situaciones ?? listaVacia}
          indicadores={indicadoresSerie}
        />
      )}
    </div>
  )
}

// ─── Gráfico de línea de la serie mensual ───────────────────────────────────
// Líneas SUPERPUESTAS (NO apiladas, §6): una `total` destacada + una por estado
// presente + la derivada "activos y comisionados". Las series NO son disjuntas,
// por eso no se apilan. Color/orden del módulo compartido; cada serie se puede
// prender/apagar desde la leyenda.
type PuntoEvolucion = KpiDotacionEvolucion['puntos'][number]

interface SerieLinea {
  clave: string
  label: string
  valores: number[]
  color: string
  dashed?: boolean
  principal: boolean
}

// Serie de un indicador ya re-asociada a su color/label del estado local.
interface IndicadorSerieUI {
  id: string
  label: string
  color: EstiloSerie
  puntos: PuntoEvolucion[]
}

// Layout de la pila de etiquetas del último punto y del tooltip.
const filaH = 14
const padding = 6

function LineaEvolucion({
  puntos,
  situaciones,
  indicadores,
}: {
  puntos: PuntoEvolucion[]
  situaciones: string[]
  indicadores?: IndicadorSerieUI[]
}) {
  // Modo: 0 indicadores → desglose por estado (como hoy); ≥1 → una línea por
  // indicador (su TOTAL), sin desglose.
  const modoDesglose = (indicadores?.length ?? 0) === 0

  // En multi, el eje temporal se toma del PRIMER indicador con puntos (nunca de
  // indicadores[0] a ciegas). En desglose, de `puntos`.
  const puntosEje = modoDesglose
    ? puntos
    : (indicadores?.find((ind) => ind.puntos.length > 0)?.puntos ?? [])
  const n = puntosEje.length
  const meses = puntosEje.map((p) => p.mes)

  // Series a graficar. Desglose §6.1: TOTAL primero (destacada), luego activo,
  // "activos y comisionados" (tras activo), comision, retencion, etc. Multi: una
  // SerieLinea por indicador (clave = id, valores = total por mes).
  const series = useMemo<SerieLinea[]>(() => {
    if (!modoDesglose) {
      return (indicadores ?? []).map((ind) => ({
        clave: ind.id,
        label: ind.label,
        valores: ind.puntos.map((p) => p.total),
        color: ind.color.color,
        principal: false,
      }))
    }
    const estados = ordenarSituaciones(situaciones)
    const out: SerieLinea[] = []
    const etotal = estiloSerie(CLAVE_TOTAL)
    out.push({
      clave: CLAVE_TOTAL,
      label: etiquetaSituacion(CLAVE_TOTAL),
      valores: puntos.map((p) => p.total),
      color: etotal.color,
      principal: true,
    })
    for (const sit of estados) {
      const e = estiloSerie(sit)
      out.push({
        clave: sit,
        label: etiquetaSituacion(sit),
        valores: puntos.map((p) => p.porSituacion[sit] ?? 0),
        color: e.color,
        dashed: e.dashed,
        principal: false,
      })
      // La línea derivada "activos y comisionados" va inmediatamente tras `activo`.
      if (sit === 'activo') {
        const eayc = estiloSerie(CLAVE_ACTIVOS_Y_COMISIONADOS)
        out.push({
          clave: CLAVE_ACTIVOS_Y_COMISIONADOS,
          label: etiquetaSituacion(CLAVE_ACTIVOS_Y_COMISIONADOS),
          valores: puntos.map((p) => p.activosYComisionados),
          color: eayc.color,
          dashed: eayc.dashed,
          principal: false,
        })
      }
    }
    return out
  }, [modoDesglose, indicadores, puntos, situaciones])

  // Toggles de visibilidad por serie (todas visibles al inicio).
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set())
  function toggleSerie(clave: string) {
    setOcultas((prev) => {
      const next = new Set(prev)
      if (next.has(clave)) next.delete(clave)
      else next.add(clave)
      return next
    })
  }

  // Al cambiar el conjunto/modo de series, descartar claves ocultas que ya no
  // existen (evita arrastrar toggles de un modo al otro).
  const clavesVigentes = series.map((s) => s.clave).join('|')
  useEffect(() => {
    const vigentes = new Set(clavesVigentes.split('|'))
    setOcultas((prev) => {
      let cambio = false
      const next = new Set<string>()
      for (const k of prev) {
        if (vigentes.has(k)) next.add(k)
        else cambio = true
      }
      return cambio ? next : prev
    })
  }, [clavesVigentes])

  // Mes bajo el cursor (tooltip por punto). null = sin hover.
  const [mesHover, setMesHover] = useState<number | null>(null)

  // Única fuente de verdad de "qué está visible": alimenta polilíneas, pila del
  // último punto, tooltip y rango Y.
  const visibles = series.filter((s) => !ocultas.has(s.clave))
  const hayVisibles = visibles.length > 0

  // Rango Y sobre todos los valores visibles (superpuestas, no apiladas). Con 0
  // visibles, calcularRangoY([]) devuelve {0,10}.
  const { yMin, yMax } = calcularRangoY(visibles.flatMap((s) => s.valores))
  const yRange = yMax - yMin || 1

  // x de un punto: única definición, usada en coordsDe, bandas, guía y etiquetas.
  const coordX = (i: number) => P.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)

  const coordsDe = (valores: number[]) =>
    valores.map((v, i) => {
      const x = coordX(i)
      const y = P.top + innerH - ((v - yMin) / yRange) * innerH
      return { x, y }
    })

  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax]

  const serieTotal = modoDesglose ? series.find((s) => s.principal) : undefined

  // ── Pila de etiquetas del último punto (todas las series visibles) ──────────
  // Ordenadas desc por el valor del último punto; `textAnchor="end"`, dy
  // incremental fijo. En desglose la TOTAL entra como primera fila (y deja de
  // dibujar su <text> suelto del último punto). yBase = y del valor más alto.
  const pilaUltimo = useMemo(() => {
    if (!hayVisibles || n === 0) return []
    const filas = visibles
      .map((s) => {
        const v = s.valores[n - 1] ?? 0
        const y = P.top + innerH - ((v - yMin) / yRange) * innerH
        return { clave: s.clave, color: s.color, valor: v, y }
      })
      .sort((a, b) => b.valor - a.valor)
    const yBase = Math.min(...filas.map((f) => f.y))
    return filas.map((f, idx) => ({ ...f, yFila: yBase + idx * filaH }))
  }, [visibles, hayVisibles, n, yMin, yRange])

  // ── Cifras de cabecera ──────────────────────────────────────────────────────
  // Desglose: Dotación actual + variación + sub-cifras por estado al corte.
  const totalActual = puntos[n - 1]?.total ?? 0
  const totalInicial = puntos[0]?.total ?? 0
  const delta = totalActual - totalInicial
  const deltaPct = totalInicial > 0 ? (delta / totalInicial) * 100 : 0
  const corte = puntos[n - 1]
  const estadosOrdenados = ordenarSituaciones(situaciones)

  return (
    <div className="space-y-3">
      {modoDesglose && n > 0 ? (
        <div className="flex flex-wrap gap-6 items-baseline">
          <div>
            <p className="text-xs text-gray-500">Dotación actual</p>
            <p className="text-2xl font-bold text-gray-900">{formatNum(totalActual)}</p>
            <p className="text-xs text-gray-400">al corte {formatMes(puntosEje[n - 1]!.mes)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Variación vs {formatMes(puntosEje[0]!.mes)}</p>
            <p className={`text-lg font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{formatNum(delta)}
              <span className="text-sm font-medium ml-1">
                ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
              </span>
            </p>
          </div>
          {/* Sub-cifras por estado al corte */}
          {corte && estadosOrdenados.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {estadosOrdenados.map((sit) => (
                <div key={`corte-${sit}`}>
                  <p className="text-[11px] text-gray-500">{etiquetaSituacion(sit)}</p>
                  <p className="text-sm font-semibold" style={{ color: estiloSerie(sit).color }}>
                    {formatNum(corte.porSituacion[sit] ?? 0)}
                  </p>
                </div>
              ))}
              <div>
                <p className="text-[11px] text-gray-500">{etiquetaSituacion(CLAVE_ACTIVOS_Y_COMISIONADOS)}</p>
                <p
                  className="text-sm font-semibold"
                  style={{ color: estiloSerie(CLAVE_ACTIVOS_Y_COMISIONADOS).color }}
                >
                  {formatNum(corte.activosYComisionados)}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Multi: una cifra por indicador (valor del último punto).
        <div className="flex flex-wrap gap-x-6 gap-y-1 items-baseline">
          {(indicadores ?? []).map((ind) => (
            <div key={`cab-${ind.id}`}>
              <p className="text-[11px] text-gray-500 flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: ind.color.color }}
                />
                {ind.label}
              </p>
              <p className="text-lg font-bold" style={{ color: ind.color.color }}>
                {formatNum(ind.puntos[ind.puntos.length - 1]?.total ?? 0)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Leyenda con toggles por serie */}
      <div className="flex flex-wrap gap-2">
        {series.map((s) => {
          const on = !ocultas.has(s.clave)
          return (
            <button
              key={`leg-${s.clave}`}
              type="button"
              onClick={() => toggleSerie(s.clave)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs transition-colors ${
                on ? 'border-gray-300 text-gray-700' : 'border-gray-200 text-gray-300'
              }`}
            >
              <span
                className="inline-block h-0.5 w-4"
                style={{
                  backgroundColor: s.color,
                  opacity: on ? 1 : 0.4,
                  borderTop: s.dashed ? `1px dashed ${s.color}` : undefined,
                }}
              />
              {s.label}
            </button>
          )
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Área tenue bajo la serie total (solo desglose, si está visible) */}
        {serieTotal && !ocultas.has(serieTotal.clave) && (
          <polygon
            points={[
              `${P.left},${P.top + innerH}`,
              ...coordsDe(serieTotal.valores).map((c) => `${c.x},${c.y}`),
              `${P.left + innerW},${P.top + innerH}`,
            ].join(' ')}
            fill={COLOR_LIGHT}
            opacity={0.5}
          />
        )}

        {yTicks.map((t) => {
          const y = P.top + innerH - ((t - yMin) / yRange) * innerH
          return (
            <g key={`tick-${t}`}>
              <line x1={P.left} x2={P.left + innerW} y1={y} y2={y} stroke="#E5E7EB" strokeWidth={0.8} />
              <text x={P.left - 6} y={y + 4} textAnchor="end" fontSize={11} fill="#9CA3AF">
                {formatNum(t)}
              </text>
            </g>
          )
        })}

        {/* Series secundarias primero (en desglose), la total encima; en multi
            todas las líneas de indicador. */}
        {visibles
          .filter((s) => !s.principal)
          .map((s) => (
            <polyline
              key={`line-${s.clave}`}
              points={coordsDe(s.valores).map((c) => `${c.x},${c.y}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
              strokeOpacity={0.85}
              strokeDasharray={s.dashed ? '5 3' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

        {serieTotal && !ocultas.has(serieTotal.clave) && (
          <>
            <polyline
              points={coordsDe(serieTotal.valores).map((c) => `${c.x},${c.y}`).join(' ')}
              fill="none"
              stroke={serieTotal.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {coordsDe(serieTotal.valores).map((c, i) => {
              const isLast = i === n - 1
              return (
                <g key={`pt-${i}`}>
                  <circle cx={c.x} cy={c.y} r={isLast ? 4.5 : 3.5} fill={serieTotal.color} />
                  {/* El valor del último punto vive en la pila ordenada; el primero
                      conserva su etiqueta propia (textAnchor=start). */}
                  {i > 0 && i < n - 1 && (
                    <text
                      x={c.x}
                      y={c.y - 8}
                      textAnchor="middle"
                      fontSize={10}
                      fill={serieTotal.color}
                      fontWeight="normal"
                    >
                      {formatNum(serieTotal.valores[i]!)}
                    </text>
                  )}
                  {i === 0 && (
                    <text
                      x={c.x}
                      y={c.y - 8}
                      textAnchor="start"
                      fontSize={10}
                      fill={serieTotal.color}
                    >
                      {formatNum(serieTotal.valores[i]!)}
                    </text>
                  )}
                </g>
              )
            })}
          </>
        )}

        {/* Pila de etiquetas del último punto: cada serie visible, su valor del
            último mes, ordenadas desc y apiladas para no solaparse. */}
        {hayVisibles &&
          n > 0 &&
          pilaUltimo.map((f) => (
            <text
              key={`stack-${f.clave}`}
              x={P.left + innerW}
              y={f.yFila}
              textAnchor="end"
              fontSize={10}
              fontWeight="bold"
              fill={f.color}
            >
              {formatNum(f.valor)}
            </text>
          ))}

        {/* Placeholder cuando el usuario apagó todas las series. */}
        {!hayVisibles && (
          <text
            x={P.left + innerW / 2}
            y={P.top + innerH / 2}
            textAnchor="middle"
            fontSize={12}
            fill="#9CA3AF"
          >
            todas las series ocultas
          </text>
        )}

        {/* Etiquetas de mes en el eje X */}
        {meses.map((mes, i) => (
          <text key={`lbl-${i}`} x={coordX(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#9CA3AF">
            {formatMes(mes)}
          </text>
        ))}

        {/* Bandas invisibles por mes: disparan el tooltip al pasar el mouse. */}
        {hayVisibles &&
          n > 0 &&
          meses.map((_, i) => {
            const bandW = n > 1 ? innerW / (n - 1) : innerW
            return (
              <rect
                key={`band-${i}`}
                x={coordX(i) - bandW / 2}
                y={P.top}
                width={bandW}
                height={innerH}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={() => setMesHover(i)}
                onMouseLeave={() => setMesHover(null)}
              />
            )
          })}

        {/* Tooltip por mes: línea guía + caja con el valor de cada serie visible.
            Último hijo del svg para que nunca quede tapado. */}
        {hayVisibles && mesHover !== null && n > 0 && (() => {
          const xg = coordX(mesHover)
          const filasTip = visibles
            .map((s) => ({
              clave: s.clave,
              label: s.label,
              color: s.color,
              valor: s.valores[mesHover] ?? 0,
            }))
            .sort((a, b) => b.valor - a.valor)
          const boxH = filasTip.length * filaH + 2 * padding
          const boxW = 180
          const haciaIzquierda = xg > P.left + innerW / 2
          const boxX = haciaIzquierda ? xg - boxW - 8 : xg + 8
          const boxY = Math.min(P.top, P.top + innerH - boxH)
          return (
            <g>
              <line
                x1={xg}
                x2={xg}
                y1={P.top}
                y2={P.top + innerH}
                stroke="#9CA3AF"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <rect
                x={boxX}
                y={boxY}
                width={boxW}
                height={boxH}
                rx={4}
                fill="#FFFFFF"
                fillOpacity={0.95}
                stroke="#E5E7EB"
                strokeWidth={1}
              />
              <text x={boxX + padding} y={boxY - 4} fontSize={10} fill="#6B7280" fontWeight="bold">
                {formatMes(meses[mesHover]!)}
              </text>
              {filasTip.map((f, idx) => {
                const yRow = boxY + padding + idx * filaH + filaH - 4
                return (
                  <g key={`tip-${f.clave}`}>
                    <rect x={boxX + padding} y={yRow - 8} width={8} height={8} rx={1} fill={f.color} />
                    <text x={boxX + padding + 12} y={yRow} fontSize={10} fill="#374151">
                      {f.label}
                    </text>
                    <text
                      x={boxX + boxW - padding}
                      y={yRow}
                      textAnchor="end"
                      fontSize={10}
                      fontWeight="bold"
                      fill={f.color}
                    >
                      {formatNum(f.valor)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
