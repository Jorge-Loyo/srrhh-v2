// Sección "Evolución de dotación" (tarjetas) de Reportes. Consume el nuevo
// shape `KpiDotacionHistorica`: una tarjeta por CÓDIGO de registro (carrera),
// rotulada con su `literal`. Cada mini-gráfico dibuja la serie `total` (campo
// propio, NO suma de estados) como línea principal + las series por situación
// de revista presentes (`porSituacion`) como líneas finas tenues. El número
// grande es el `total` actual con separador de miles (entero exacto, §10).
import { useMemo } from 'react'
import type { KpiDotacionHistorica } from '@srrhh/types'
import {
  CLAVE_TOTAL,
  estiloSerie,
  colorCarrera,
  ordenarSituaciones,
  etiquetaSituacion,
} from '../lib/situacion-revista'

// ─── Dimensiones del mini-gráfico ───────────────────────────────────────────
const MW = 320
const MH = 110
const MP = { top: 14, right: 48, bottom: 22, left: 44 }
const innerW = MW - MP.left - MP.right
const innerH = MH - MP.top - MP.bottom

function formatFecha(iso: string | Date, agrupacion: 'mes' | 'subida'): string {
  const d = new Date(iso)
  if (agrupacion === 'mes') return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function techoLimpio(max: number): number {
  if (max <= 0) return 10
  const mag = 10 ** Math.floor(Math.log10(max))
  for (const p of [1, 2, 2.5, 5, 10]) { if (p * mag >= max) return p * mag }
  return 10 * mag
}

function calcularRangoY(valores: number[]): { yMin: number; yMax: number } {
  const vals = valores.filter(v => v > 0)
  if (vals.length === 0) return { yMin: 0, yMax: 10 }
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const rango = max - min
  if (rango / max > 0.3) return { yMin: 0, yMax: techoLimpio(max) }
  const padding = Math.max(rango * 0.5, max * 0.005)
  return {
    yMin: Math.floor(min - padding),
    yMax: Math.ceil(max + padding),
  }
}

// `formatK` queda SOLO para los ticks del eje Y de los mini-gráficos (donde el
// ahorro de espacio importa y la precisión exacta no). El número grande de cada
// tarjeta usa `toLocaleString('es-AR')` (entero exacto).
function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return n.toLocaleString('es-AR')
}

// Una serie a dibujar dentro de un mini-gráfico: la total (principal) o una por
// estado (secundaria, línea fina tenue).
interface SerieMini {
  clave: string
  label: string
  valores: number[]
  color: string
  colorLight: string
  dashed?: boolean
  principal: boolean
}

// Datos de una tarjeta = una carrera (código) con su serie total + desglose.
interface TarjetaCarrera {
  codigo: string
  literal: string
  // Códigos de registro que agrupa esta tarjeta (el propio + los absorbidos por
  // fusión visual). Si es más de uno, se muestra como aclaración en la tarjeta.
  codigosAgrupados: string[]
  actual: number
  inicial: number
  series: SerieMini[]
  fechas: string[]
}

interface Props {
  data: KpiDotacionHistorica | undefined
}

export function EvolucionDotacionChart({ data }: Props) {
  // Cada punto del backend es el cierre de un mes (el padrón de fecha más
  // tardía de ese mes), así que el eje X se rotula por mes.
  const agrupacion = 'mes' as const
  const puntos = data?.puntos ?? []
  const carreras = data?.carreras ?? []
  // Estados presentes ordenados en el orden canónico §6.1 (leyenda/colores
  // estables entre cargas).
  const situaciones = useMemo(
    () => ordenarSituaciones(data?.situaciones ?? []),
    [data?.situaciones]
  )

  const fechas = useMemo(() => puntos.map((p) => p.fecha), [puntos])

  // Una tarjeta por carrera (código), rotulada con su literal. La serie TOTAL
  // (campo `total`, NO suma de estados) es la principal; las series por estado
  // presentes se dibujan finas y tenues. Ordenadas por total actual desc.
  const tarjetas = useMemo<TarjetaCarrera[]>(() => {
    const ultimo = puntos[puntos.length - 1]
    const primero = puntos[0]

    // Fusión SOLO VISUAL de códigos de registro en una sola tarjeta. El código
    // 22 (CPH, secundario, ~2 cargos) se suma al 37 bajo "Nueva Carrera
    // Profesional Hospitalaria" y no se muestra como tarjeta aparte. El dato en
    // la BD no cambia: el 22 sigue existiendo; esto solo afecta este gráfico.
    // Mapa: código absorbido → código destino.
    const FUSION_CODIGOS: Record<string, string> = { '22': '37' }
    const codigosAbsorbidos = new Set(Object.keys(FUSION_CODIGOS))

    // Suma el total de un punto para un código destino + todos los que absorbe.
    const totalFusionado = (punto: (typeof puntos)[number] | undefined, codigoDestino: string): number => {
      if (!punto) return 0
      let s = punto.porCarrera[codigoDestino]?.total ?? 0
      for (const [abs, dest] of Object.entries(FUSION_CODIGOS)) {
        if (dest === codigoDestino) s += punto.porCarrera[abs]?.total ?? 0
      }
      return s
    }
    // Ídem para una situación de revista puntual.
    const situacionFusionada = (punto: (typeof puntos)[number], codigoDestino: string, sit: string): number => {
      let s = punto.porCarrera[codigoDestino]?.porSituacion[sit] ?? 0
      for (const [abs, dest] of Object.entries(FUSION_CODIGOS)) {
        if (dest === codigoDestino) s += punto.porCarrera[abs]?.porSituacion[sit] ?? 0
      }
      return s
    }

    return carreras
      // No mostrar como tarjeta aparte los códigos que se absorben en otro.
      .filter(({ codigo }) => !codigosAbsorbidos.has(codigo))
      .map(({ codigo, literal }) => {
        const totalValores = puntos.map((p) => totalFusionado(p, codigo))
        // Color propio por carrera (código) para la línea total de la tarjeta,
        // así cada mini-gráfico se distingue de un vistazo. Las series por
        // situación de revista conservan su color fijo por estado.
        const estiloTotal = colorCarrera(codigo)
        const serieTotal: SerieMini = {
          clave: CLAVE_TOTAL,
          label: etiquetaSituacion(CLAVE_TOTAL),
          valores: totalValores,
          color: estiloTotal.color,
          colorLight: estiloTotal.colorLight,
          principal: true,
        }
        const seriesEstado: SerieMini[] = situaciones.map((sit) => {
          const e = estiloSerie(sit)
          return {
            clave: sit,
            label: etiquetaSituacion(sit),
            valores: puntos.map((p) => situacionFusionada(p, codigo, sit)),
            color: e.color,
            colorLight: e.colorLight,
            dashed: e.dashed,
            principal: false,
          }
        })
        // Códigos que agrupa esta tarjeta: el propio + los absorbidos hacia él.
        const absorbidosHaciaEste = Object.entries(FUSION_CODIGOS)
          .filter(([, dest]) => dest === codigo)
          .map(([abs]) => abs)
        const codigosAgrupados = [codigo, ...absorbidosHaciaEste]
        return {
          codigo,
          literal,
          codigosAgrupados,
          actual: totalFusionado(ultimo, codigo),
          inicial: totalFusionado(primero, codigo),
          series: [serieTotal, ...seriesEstado],
          fechas,
        }
      })
      .sort((a, b) => b.actual - a.actual)
  }, [puntos, carreras, situaciones, fechas])

  const { totalActual, totalInicio, variacionNeta, variacionPct, grupoMayorCrecimiento } = useMemo(() => {
    if (puntos.length === 0) return { totalActual: 0, totalInicio: 0, variacionNeta: 0, variacionPct: 0, grupoMayorCrecimiento: '—' }
    // Totales de cabecera recalculados sobre `porCarrera[codigo].total`.
    const totalActual = tarjetas.reduce((s, t) => s + t.actual, 0)
    const totalInicio = tarjetas.reduce((s, t) => s + t.inicial, 0)
    const variacionNeta = totalActual - totalInicio
    const variacionPct = totalInicio > 0 ? (variacionNeta / totalInicio) * 100 : 0

    let maxCrecimiento = -Infinity
    let grupoMayorCrecimiento = '—'
    for (const t of tarjetas) {
      const delta = t.actual - t.inicial
      if (delta > maxCrecimiento) { maxCrecimiento = delta; grupoMayorCrecimiento = t.literal }
    }
    return { totalActual, totalInicio, variacionNeta, variacionPct, grupoMayorCrecimiento }
  }, [puntos, tarjetas])

  const fechaCorte = puntos.length > 0
    ? new Date(puntos[puntos.length - 1]!.fecha).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
    : '—'

  if (puntos.length === 0) {
    return <p className="text-sm text-gray-400">Todavía no hay snapshots de padrón aprobados para graficar.</p>
  }

  if (puntos.length < 3) {
    return <p className="text-sm text-gray-400">Se necesitan al menos 3 snapshots completos para mostrar la evolución. Hay {puntos.length} disponible{puntos.length !== 1 ? 's' : ''} hasta ahora.</p>
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Dotación total"
          value={totalActual.toLocaleString('es-AR')}
          sub={`al corte ${fechaCorte}`}
        />
        <KpiCard
          label={`Variación vs ${formatFecha(puntos[0]!.fecha, 'mes')}`}
          value={`${variacionNeta >= 0 ? '+' : ''}${variacionNeta.toLocaleString('es-AR')}`}
          sub={`${variacionPct >= 0 ? '+' : ''}${variacionPct.toFixed(1)}%`}
          trend={variacionNeta >= 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="Mayor crecimiento"
          value={grupoMayorCrecimiento}
          sub="en el período"
          small
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {tarjetas.map((t) => (
          <MiniLineChart
            key={t.codigo}
            label={t.literal}
            codigosAgrupados={t.codigosAgrupados}
            series={t.series}
            actual={t.actual}
            inicial={t.inicial}
            fechas={t.fechas}
            agrupacion={agrupacion}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Mini gráfico de línea individual ───────────────────────────────────────
// Dibuja la serie total (principal, con área) + las series por estado (finas
// tenues). El rango Y se calcula sobre la serie total (la de mayor magnitud).
function MiniLineChart({
  label, codigosAgrupados, series, actual, inicial, fechas, agrupacion,
}: {
  label: string
  codigosAgrupados: string[]
  series: SerieMini[]
  actual: number
  inicial: number
  fechas: (string | Date)[]
  agrupacion: 'mes' | 'subida'
}) {
  const principal = series.find((s) => s.principal) ?? series[0]!
  const { yMin, yMax } = calcularRangoY(principal.valores)
  const yRange = yMax - yMin || 1
  const n = principal.valores.length

  const labelStep = Math.max(1, Math.ceil(n / 5))

  const coordsDe = (valores: number[]) =>
    valores.map((v, i) => {
      const x = MP.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
      const y = MP.top + innerH - ((v - yMin) / yRange) * innerH
      return `${x},${y}`
    })

  const areaPoints = [
    `${MP.left},${MP.top + innerH}`,
    ...coordsDe(principal.valores),
    `${MP.left + innerW},${MP.top + innerH}`,
  ].join(' ')

  const delta = actual - inicial

  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax]

  // Series secundarias (por estado) y la principal; se dibujan las secundarias
  // primero para que la total quede por encima.
  const secundarias = series.filter((s) => !s.principal)

  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
      <div className="flex items-start justify-between mb-1">
        <div className="max-w-[170px]">
          <p className="text-xs font-semibold text-gray-700 leading-tight">{label}</p>
          {codigosAgrupados.length > 1 && (
            <p className="text-[9px] text-gray-400 leading-tight mt-0.5">
              Incluye códigos {codigosAgrupados.join(' + ')}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-sm font-bold" style={{ color: principal.color }}>
            {actual.toLocaleString('es-AR')}
          </p>
          <p className={`text-xs font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${MW} ${MH}`} className="w-full h-auto">
        <polygon points={areaPoints} fill={principal.colorLight} opacity={0.7} />

        {/* Gridlines Y — formatK solo acá (ticks del eje) */}
        {yTicks.map((t) => {
          const y = MP.top + innerH - ((t - yMin) / yRange) * innerH
          return (
            <g key={`tick-${t}`}>
              <line x1={MP.left} x2={MP.left + innerW} y1={y} y2={y} stroke="#E5E7EB" strokeWidth={0.8} />
              <text x={MP.left - 4} y={y + 3.5} textAnchor="end" fontSize={9} fill="#9CA3AF">
                {formatK(t)}
              </text>
            </g>
          )
        })}

        {/* Series secundarias por estado: líneas finas tenues */}
        {secundarias.map((s) => (
          <polyline
            key={`serie-${s.clave}`}
            points={coordsDe(s.valores).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={1}
            strokeOpacity={0.55}
            strokeDasharray={s.dashed ? '3 2' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Serie total: línea principal destacada */}
        <polyline
          points={coordsDe(principal.valores).join(' ')}
          fill="none"
          stroke={principal.color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Punto + label en cada punto de la serie total */}
        {principal.valores.map((v, i) => {
          const x = MP.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
          const y = MP.top + innerH - ((v - yMin) / yRange) * innerH
          const isLast = i === n - 1
          return (
            <g key={`pt-${i}`}>
              <circle cx={x} cy={y} r={isLast ? 3.5 : 2.5} fill={principal.color} />
              <text
                x={x}
                y={y - 5}
                textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'}
                fontSize={8}
                fill={principal.color}
                fontWeight={isLast ? 'bold' : 'normal'}
              >
                {formatK(v)}
              </text>
            </g>
          )
        })}

        {/* Eje X */}
        {fechas.map((f, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null
          const x = MP.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
          return (
            <text key={`lbl-${i}`} x={x} y={MH - 4} textAnchor="middle" fontSize={9} fill="#9CA3AF">
              {formatFecha(f, agrupacion)}
            </text>
          )
        })}
      </svg>

      {/* Leyenda de estados (solo si hay desglose) */}
      {secundarias.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {series.map((s) => (
            <span key={`leg-${s.clave}`} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <span
                className="inline-block h-0.5 w-3"
                style={{ backgroundColor: s.color, opacity: s.principal ? 1 : 0.6 }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, trend, small,
}: {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down'
  small?: boolean
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-bold text-gray-900 leading-tight ${small ? 'text-sm' : 'text-2xl'}`}>{value}</p>
      {sub && (
        <p className={`text-xs mt-0.5 ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
          {trend === 'up' && '▲ '}{trend === 'down' && '▼ '}{sub}
        </p>
      )}
    </div>
  )
}
