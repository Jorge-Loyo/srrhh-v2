import { useEffect, useMemo, useRef, useState } from 'react'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import {
  useDotacionEvolucion,
  useDotacionEvolucionOpciones,
  useExportDotacionEvolucion,
} from '../hooks/useKpis'

// ─── Dimensiones del gráfico ────────────────────────────────────────────────
const W = 720
const H = 260
const P = { top: 20, right: 60, bottom: 34, left: 56 }
const innerW = W - P.left - P.right
const innerH = H - P.top - P.bottom

const COLOR = '#1D6FA4'
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

export function EvolucionEspecialidadChart() {
  const [siglas, setSiglas] = useState<string[]>([])
  const [carreras, setCarreras] = useState<string[]>([])
  const [puestos, setPuestos] = useState<string[]>([])
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [mesDesde, setMesDesde] = useState('')
  const [mesHasta, setMesHasta] = useState('')

  const filtros = {
    siglas,
    carreras,
    puestos,
    especialidades,
    mesDesde: mesDesde || undefined,
    mesHasta: mesHasta || undefined,
  }

  const { data: hospitales } = useHospitales()
  // Opciones facetadas: se recalculan en backend según la selección actual.
  const { data: opciones, isLoading: loadingOpciones } = useDotacionEvolucionOpciones(filtros)
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
  const carreraOpts = useMemo<ComboOption[]>(
    () => (opciones?.carreras ?? listaVacia).map((c) => ({ value: c, label: c })),
    [opciones]
  )
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

  const haySeleccion =
    siglas.length + carreras.length + puestos.length + especialidades.length > 0
  const hayFiltroActivo = haySeleccion || Boolean(mesDesde || mesHasta)
  const puntos = serie?.puntos ?? []

  function limpiar() {
    setSiglas([])
    setCarreras([])
    setPuestos([])
    setEspecialidades([])
    setMesDesde('')
    setMesHasta('')
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

        {hayFiltroActivo && (
          <button
            type="button"
            onClick={limpiar}
            className="text-sm text-gray-500 hover:text-gray-700 underline h-9"
          >
            Limpiar filtros
          </button>
        )}

        {haySeleccion && (
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

      {/* ── Gráfico ───────────────────────────────────────────────────── */}
      {!haySeleccion ? (
        <p className="text-sm text-gray-400">
          Elegí al menos un filtro (efector, carrera, puesto o especialidad) para ver la evolución mensual de la dotación.
        </p>
      ) : isFetching ? (
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      ) : puntos.length === 0 ? (
        <p className="text-sm text-gray-400">No hay datos de padrón para esta combinación.</p>
      ) : (
        <LineaEvolucion puntos={puntos} />
      )}
    </div>
  )
}

// ─── Gráfico de línea de la serie mensual ───────────────────────────────────
function LineaEvolucion({ puntos }: { puntos: { mes: string; cantidad: number }[] }) {
  const valores = puntos.map((p) => p.cantidad)
  const { yMin, yMax } = calcularRangoY(valores)
  const yRange = yMax - yMin || 1
  const n = valores.length

  const coords = valores.map((v, i) => {
    const x = P.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
    const y = P.top + innerH - ((v - yMin) / yRange) * innerH
    return { x, y }
  })

  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const areaPoints = [
    `${P.left},${P.top + innerH}`,
    ...coords.map((c) => `${c.x},${c.y}`),
    `${P.left + innerW},${P.top + innerH}`,
  ].join(' ')

  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax]

  const actual = valores[n - 1] ?? 0
  const inicial = valores[0] ?? 0
  const delta = actual - inicial
  const deltaPct = inicial > 0 ? (delta / inicial) * 100 : 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-6 items-baseline">
        <div>
          <p className="text-xs text-gray-500">Dotación actual</p>
          <p className="text-2xl font-bold text-gray-900">{formatNum(actual)}</p>
          <p className="text-xs text-gray-400">al corte {formatMes(puntos[n - 1]!.mes)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Variación vs {formatMes(puntos[0]!.mes)}</p>
          <p className={`text-lg font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{formatNum(delta)}
            <span className="text-sm font-medium ml-1">
              ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
            </span>
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <polygon points={areaPoints} fill={COLOR_LIGHT} opacity={0.6} />

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

        <polyline
          points={linePoints}
          fill="none"
          stroke={COLOR}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {coords.map((c, i) => {
          const isLast = i === n - 1
          return (
            <g key={`pt-${i}`}>
              <circle cx={c.x} cy={c.y} r={isLast ? 4.5 : 3.5} fill={COLOR} />
              <text
                x={c.x}
                y={c.y - 8}
                textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'}
                fontSize={10}
                fill={COLOR}
                fontWeight={isLast ? 'bold' : 'normal'}
              >
                {formatNum(valores[i]!)}
              </text>
            </g>
          )
        })}

        {puntos.map((p, i) => {
          const x = P.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
          return (
            <text key={`lbl-${i}`} x={x} y={H - 8} textAnchor="middle" fontSize={11} fill="#9CA3AF">
              {formatMes(p.mes)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
