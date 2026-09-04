import { useMemo } from 'react'
import type { KpiDotacionHistorica } from '@srrhh/types'

// Nombres canónicos = escalafones.nombre (activo=true) de la BD.
// El backend resuelve via cargo→escalafon_id→escalafones, nunca el campo texto desnormalizado.
const MACRO_GRUPOS: { label: string; escalafones: string[]; color: string; colorLight: string }[] = [
  {
    label: 'Nueva Carrera Prof. Hosp',
    escalafones: ['Nueva Carrera Profesional Hospitalaria'],
    color: '#1D6FA4',
    colorLight: '#DBEAFE',
  },
  {
    label: 'Nueva Carrera Enfermería',
    escalafones: ['Nueva Carrera Enfermería'],
    color: '#0E9F8E',
    colorLight: '#CCFBF1',
  },
  {
    label: 'Nueva Carrera Administrativa',
    escalafones: ['Nueva Carrera Administrativa'],
    color: '#2D7D46',
    colorLight: '#DCFCE7',
  },
  {
    label: 'Guardias y Residencias',
    escalafones: ['Salud - Guardias', 'Residentes'],
    color: '#5B6FA8',
    colorLight: '#E0E7FF',
  },
  {
    label: 'Régimen Modular / Transitorio',
    escalafones: [
      'Régimen Modular Extraordinario PG',
      'Plantas Transitorias Acta 06/2014',
      'Plantas Transitorias Modulo Operativo',
    ],
    color: '#A07840',
    colorLight: '#FEF3C7',
  },
  {
    label: 'Otros / Fuera de Escala',
    escalafones: [
      'Gabinete',
      'Autoridades Superiores',
      'CEETPS',
      'Docentes Históricos',
      'Carrera Gerencial',
      'Cuerpo Especialistas Profesionales',
    ],
    color: '#6B7280',
    colorLight: '#F3F4F6',
  },
]

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

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return n.toLocaleString('es-AR')
}

interface Props {
  data: KpiDotacionHistorica | undefined
}

export function EvolucionDotacionChart({ data }: Props) {
  const agrupacion = 'mes' as const
  const puntos = data?.puntos ?? []
  const todosEscalafones = data?.escalafones ?? []

  const seriesPorGrupo = useMemo(() =>
    MACRO_GRUPOS.map((g) => ({
      ...g,
      valores: puntos.map((p) =>
        g.escalafones.reduce((s, e) => s + (p.porEscalafon[e] ?? 0), 0)
      ),
    })),
    [puntos]
  )

  const { totalActual, totalInicio, variacionNeta, variacionPct, grupoMayorCrecimiento } = useMemo(() => {
    if (puntos.length === 0) return { totalActual: 0, totalInicio: 0, variacionNeta: 0, variacionPct: 0, grupoMayorCrecimiento: '—' }
    const ultimo = puntos[puntos.length - 1]!
    const primero = puntos[0]!
    const totalActual = todosEscalafones.reduce((s, e) => s + (ultimo.porEscalafon[e] ?? 0), 0)
    const totalInicio = todosEscalafones.reduce((s, e) => s + (primero.porEscalafon[e] ?? 0), 0)
    const variacionNeta = totalActual - totalInicio
    const variacionPct = totalInicio > 0 ? (variacionNeta / totalInicio) * 100 : 0

    let maxCrecimiento = -Infinity
    let grupoMayorCrecimiento = '—'
    for (const g of seriesPorGrupo) {
      const inicio = g.valores[0] ?? 0
      const fin = g.valores[g.valores.length - 1] ?? 0
      const delta = fin - inicio
      if (delta > maxCrecimiento) { maxCrecimiento = delta; grupoMayorCrecimiento = g.label }
    }
    return { totalActual, totalInicio, variacionNeta, variacionPct, grupoMayorCrecimiento }
  }, [puntos, todosEscalafones, seriesPorGrupo])

  const fechaCorte = puntos.length > 0
    ? new Date(puntos[puntos.length - 1]!.fecha).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
    : '—'

  if (puntos.length === 0) {
    return <p className="text-sm text-gray-400">Todavía no hay snapshots de padrón aprobados para graficar.</p>
  }

  if (puntos.length < 3) {
    return <p className="text-sm text-gray-400">Se necesitan al menos 3 snapshots completos para mostrar la evolución. Hay {puntos.length} disponible{puntos.length !== 1 ? 's' : ''} hasta ahora.</p>
  }

  const escalafonesMapeados = new Set(MACRO_GRUPOS.flatMap((g) => g.escalafones))
  const sinMapear = todosEscalafones.filter((e) => !escalafonesMapeados.has(e))

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
        {seriesPorGrupo.map((grupo) => (
          <MiniLineChart
            key={grupo.label}
            label={grupo.label}
            valores={grupo.valores}
            color={grupo.color}
            colorLight={grupo.colorLight}
            fechas={puntos.map((p) => p.fecha)}
            agrupacion={agrupacion}
          />
        ))}
      </div>

      {sinMapear.length > 0 && (
        <p className="text-xs text-gray-400">
          Escalafones sin mapear: {sinMapear.join(', ')}
        </p>
      )}
    </div>
  )
}

// ─── Mini gráfico de línea individual ───────────────────────────────────────
function MiniLineChart({
  label, valores, color, colorLight, fechas, agrupacion,
}: {
  label: string
  valores: number[]
  color: string
  colorLight: string
  fechas: (string | Date)[]
  agrupacion: 'mes' | 'subida'
}) {
  const { yMin, yMax } = calcularRangoY(valores)
  const yRange = yMax - yMin || 1
  const n = valores.length

  const labelStep = Math.max(1, Math.ceil(n / 5))

  const points = valores.map((v, i) => {
    const x = MP.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
    const y = MP.top + innerH - ((v - yMin) / yRange) * innerH
    return `${x},${y}`
  }).join(' ')

  const areaPoints = [
    `${MP.left},${MP.top + innerH}`,
    ...valores.map((v, i) => {
      const x = MP.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
      const y = MP.top + innerH - ((v - yMin) / yRange) * innerH
      return `${x},${y}`
    }),
    `${MP.left + innerW},${MP.top + innerH}`,
  ].join(' ')

  const ultimo = valores[n - 1] ?? 0
  const primero = valores[0] ?? 0
  const delta = ultimo - primero

  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax]

  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs font-semibold text-gray-700 leading-tight max-w-[160px]">{label}</p>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-sm font-bold" style={{ color }}>{formatK(ultimo)}</p>
          <p className={`text-xs font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${MW} ${MH}`} className="w-full h-auto">
        <polygon points={areaPoints} fill={colorLight} opacity={0.7} />

        {/* Gridlines Y — key con prefijo para evitar colisión con puntos */}
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

        <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Punto + label en cada punto — key con prefijo para evitar colisión con ticks */}
        {valores.map((v, i) => {
          const x = MP.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
          const y = MP.top + innerH - ((v - yMin) / yRange) * innerH
          const isLast = i === n - 1
          return (
            <g key={`pt-${i}`}>
              <circle cx={x} cy={y} r={isLast ? 3.5 : 2.5} fill={color} />
              <text
                x={x}
                y={y - 5}
                textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'}
                fontSize={8}
                fill={color}
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
