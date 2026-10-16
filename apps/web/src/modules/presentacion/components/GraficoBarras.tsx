import type { GraficoBarrasData, SerieBarras } from '../data/types'
import { fmtNum } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Gráfico de barras en SVG (sin librerías). Soporta:
//  · Modo SIMPLE: una serie de barras verticales (data.barras). Ej: S8.
//  · Modo AGRUPADO: varias series por categoría (data.categorias/series/valores),
//    vertical u horizontal. Ej: S9 (horizontal, 4 series mensuales por jefatura).
// Dúctil: datos, colores y rango del eje vienen por props. Tipografía Montserrat
// heredada de .presentacion.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: GraficoBarrasData
  width?: number
  height?: number
}

const COLOR_DEFECTO = '#1A2B4A' // navy
const PALETA: string[] = ['#1A2B4A', '#5BBFBF', '#ADB5BD', '#F5BF00'] // Ene/Feb/Mar/Abr

export function GraficoBarras({ data, width = 520, height = 300 }: Props) {
  const esAgrupado = Boolean(data.categorias && data.series && data.valores)
  if (esAgrupado) return <BarrasAgrupadas data={data} width={width} height={height} />
  return <BarrasSimples data={data} width={width} height={height} />
}

// ── Rango del eje de valores ──────────────────────────────────────────────────
function calcularRango(valores: number[], data: GraficoBarrasData) {
  const minDato = Math.min(...valores, 0)
  const maxDato = Math.max(...valores)
  const minY = data.minY ?? Math.floor(minDato)
  const maxY = data.maxY ?? Math.ceil(maxDato + (maxDato - minDato) * 0.1)
  const paso = data.pasoY ?? Math.max(1, Math.round((maxY - minY) / 9))
  const ticks: number[] = []
  for (let v = minY; v <= maxY + 1e-6; v += paso) ticks.push(Math.round(v))
  return { minY, maxY, ticks }
}

// ── Modo simple (vertical) ────────────────────────────────────────────────────
function BarrasSimples({ data, width, height }: Required<Props>) {
  const barras = data.barras ?? []
  const valores = barras.map((b) => b.valor).filter((v): v is number => v != null)
  if (valores.length === 0) return null

  const { minY, maxY, ticks } = calcularRango(valores, data)
  const padL = 48,
    padR = 12,
    padT = 16,
    padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const yDe = (v: number) => padT + plotH * (1 - (v - minY) / (maxY - minY))
  const slot = plotW / barras.length
  const barW = Math.min(slot * 0.5, 70)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" role="img" aria-label="Gráfico de barras">
      {ticks.map((t) => {
        const y = yDe(t)
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#E9ECEF" strokeWidth={1} />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#6C757D">
              {fmtNum(t)}
            </text>
          </g>
        )
      })}
      {barras.map((b, i) => {
        if (b.valor == null) return null
        const x = padL + slot * i + (slot - barW) / 2
        const y = yDe(b.valor)
        const h = padT + plotH - y
        return (
          <g key={b.etiqueta}>
            <rect x={x} y={y} width={barW} height={h} fill={b.color ?? COLOR_DEFECTO} rx={2} />
            <text x={x + barW / 2} y={y + 16} textAnchor="middle" fontSize={11} fontWeight={700} fill="#FFFFFF">
              {fmtNum(b.valor)}
            </text>
            <text x={x + barW / 2} y={height - padB + 16} textAnchor="middle" fontSize={10} fill="#495057">
              {b.etiqueta}
            </text>
          </g>
        )
      })}

      {/* Línea de tendencia uniendo los topes de las barras */}
      {data.lineaTendencia && (
        <polyline
          points={barras
            .map((b, i) => (b.valor == null ? null : `${padL + slot * i + slot / 2},${yDe(b.valor)}`))
            .filter(Boolean)
            .join(' ')}
          fill="none"
          stroke="#495057"
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />
      )}
    </svg>
  )
}

// ── Modo agrupado (horizontal, multi-serie) ───────────────────────────────────
function BarrasAgrupadas({ data, width, height }: Required<Props>) {
  const categorias = data.categorias!
  const series = data.series!
  const matriz = data.valores!
  const horizontal = (data.orientacion ?? 'vertical') === 'horizontal'
  const mostrarLeyenda = data.leyenda ?? true

  const planos = matriz.flat().filter((v): v is number => v != null)
  if (planos.length === 0) return null
  const { minY, maxY, ticks } = calcularRango(planos, data)

  const padL = horizontal ? 120 : 48
  const padR = 16
  const padT = mostrarLeyenda ? 28 : 12
  const padB = 32
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const colorSerie = (s: SerieBarras, i: number) => s.color ?? PALETA[i % PALETA.length]

  if (horizontal) {
    // Eje X = valores; eje Y = categorías. Barras agrupadas por categoría.
    const xDe = (v: number) => padL + plotW * ((v - minY) / (maxY - minY))
    const slot = plotH / categorias.length
    const grupoH = Math.min(slot * 0.72, 64)
    const barH = grupoH / series.length

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" role="img" aria-label="Gráfico de barras agrupadas">
        {mostrarLeyenda && <Leyenda series={series} colorSerie={colorSerie} y={14} xInicio={padL} />}
        {/* Grilla vertical + ticks eje X */}
        {ticks.map((t) => {
          const x = xDe(t)
          return (
            <g key={t}>
              <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="#E9ECEF" strokeWidth={1} />
              <text x={x} y={padT + plotH + 16} textAnchor="middle" fontSize={9} fill="#6C757D">
                {fmtNum(t)}
              </text>
            </g>
          )
        })}
        {categorias.map((cat, ci) => {
          const yGrupo = padT + slot * ci + (slot - grupoH) / 2
          return (
            <g key={cat}>
              <text x={padL - 8} y={yGrupo + grupoH / 2 + 3} textAnchor="end" fontSize={10} fill="#495057" fontWeight={600}>
                {cat}
              </text>
              {series.map((s, si) => {
                const v = matriz[ci]?.[si]
                if (v == null) return null
                const y = yGrupo + barH * si
                const w = xDe(v) - padL
                return (
                  <g key={s.nombre}>
                    <rect x={padL} y={y} width={Math.max(0, w)} height={barH - 1} fill={colorSerie(s, si)} />
                    <text x={padL + w + 4} y={y + barH / 2 + 2} fontSize={8} fill="#495057" fontWeight={600}>
                      {fmtNum(v)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    )
  }

  // Agrupado vertical (no usado aún, pero el modelo lo soporta).
  const yDe = (v: number) => padT + plotH * (1 - (v - minY) / (maxY - minY))
  const slot = plotW / categorias.length
  const grupoW = Math.min(slot * 0.72, 80)
  const barW = grupoW / series.length

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" role="img" aria-label="Gráfico de barras agrupadas">
      {mostrarLeyenda && <Leyenda series={series} colorSerie={colorSerie} y={14} xInicio={padL} />}
      {ticks.map((t) => {
        const y = yDe(t)
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#E9ECEF" strokeWidth={1} />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize={9} fill="#6C757D">
              {fmtNum(t)}
            </text>
          </g>
        )
      })}
      {categorias.map((cat, ci) => {
        const xGrupo = padL + slot * ci + (slot - grupoW) / 2
        return (
          <g key={cat}>
            <text x={xGrupo + grupoW / 2} y={height - padB + 14} textAnchor="middle" fontSize={9} fill="#495057">
              {cat}
            </text>
            {series.map((s, si) => {
              const v = matriz[ci]?.[si]
              if (v == null) return null
              const x = xGrupo + barW * si
              const y = yDe(v)
              const h = padT + plotH - y
              return <rect key={s.nombre} x={x} y={y} width={barW - 1} height={h} fill={colorSerie(s, si)} />
            })}
          </g>
        )
      })}
    </svg>
  )
}

function Leyenda({
  series,
  colorSerie,
  y,
  xInicio,
}: {
  series: SerieBarras[]
  colorSerie: (s: SerieBarras, i: number) => string
  y: number
  xInicio: number
}) {
  let x = xInicio
  return (
    <g>
      {series.map((s, i) => {
        const el = (
          <g key={s.nombre} transform={`translate(${x}, ${y})`}>
            <rect x={0} y={-7} width={9} height={9} fill={colorSerie(s, i)} rx={1} />
            <text x={13} y={1} fontSize={9} fill="#495057">
              {s.nombre}
            </text>
          </g>
        )
        x += 16 + s.nombre.length * 5.5
        return el
      })}
    </g>
  )
}
