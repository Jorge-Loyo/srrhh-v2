import type { GraficoTortaData } from '../data/types'

// ─────────────────────────────────────────────────────────────────────────────
// Gráfico de torta en SVG (sin librerías). Dibuja las porciones y, opcional, una
// leyenda arriba. Las porciones ≥ cierto umbral muestran su % dentro. Dúctil:
// datos y colores por props. Tipografía Montserrat heredada de .presentacion.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: GraficoTortaData
  width?: number
  height?: number
  /** Muestra la leyenda arriba. Default true. */
  leyenda?: boolean
}

const PALETA = ['#1A2B4A', '#F5BF00', '#C0564B', '#5BBFBF', '#ADB5BD', '#0066CC']

/** Punto en el círculo para un ángulo dado (en radianes), centro (cx,cy), radio r. */
function punto(cx: number, cy: number, r: number, ang: number) {
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) }
}

export function GraficoTorta({ data, width = 420, height = 320, leyenda = true }: Props) {
  const total = data.segmentos.reduce((s, seg) => s + (seg.valor || 0), 0)
  if (total <= 0) return null

  const legendH = leyenda ? 46 : 0
  const cx = width / 2
  const cy = legendH + (height - legendH) / 2
  const r = Math.min(width, height - legendH) / 2 - 8

  // Ángulos acumulados (empezando arriba, -90°).
  let ang = -Math.PI / 2
  const arcos = data.segmentos.map((seg, i) => {
    const frac = seg.valor / total
    const a0 = ang
    const a1 = ang + frac * Math.PI * 2
    ang = a1
    const p0 = punto(cx, cy, r, a0)
    const p1 = punto(cx, cy, r, a1)
    const largeArc = a1 - a0 > Math.PI ? 1 : 0
    const d = `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y} Z`
    // Posición de la etiqueta % (a mitad del arco, a 0.6 r del centro).
    const amid = (a0 + a1) / 2
    const pl = punto(cx, cy, r * 0.62, amid)
    const pct = data.valoresSonPorcentaje ? seg.valor : frac * 100
    return { d, color: seg.color ?? PALETA[i % PALETA.length], pl, pct, mostrar: frac >= 0.05 }
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" role="img" aria-label="Gráfico de torta">
      {/* Leyenda arriba, en dos filas si hace falta */}
      {leyenda && (
        <foreignObject x={0} y={0} width={width} height={legendH}>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-center text-[9px] text-gray-600">
            {data.segmentos.map((seg, i) => (
              <span key={seg.etiqueta} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ background: seg.color ?? PALETA[i % PALETA.length] }}
                />
                {seg.etiqueta}
              </span>
            ))}
          </div>
        </foreignObject>
      )}

      {arcos.map((a, i) => (
        <path key={i} d={a.d} fill={a.color} stroke="#fff" strokeWidth={1.5} />
      ))}

      {/* Porcentajes dentro de las porciones grandes */}
      {arcos.map((a, i) =>
        a.mostrar ? (
          <text
            key={`t${i}`}
            x={a.pl.x}
            y={a.pl.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={a.pct >= 50 ? 14 : 10}
            fontWeight={700}
            fill="#fff"
          >
            {a.pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
          </text>
        ) : null
      )}
    </svg>
  )
}
