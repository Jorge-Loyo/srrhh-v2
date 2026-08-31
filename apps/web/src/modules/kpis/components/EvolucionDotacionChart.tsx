import { useMemo, useState } from 'react'
import type { KpiDotacionHistorica } from '@srrhh/types'

// S6-5: gráfico de línea de una sola serie ("personas únicas" — dotación
// real, ver PadronHistorico.cuil agregado en S6-0) por fecha de padrón
// aprobada. Un solo eje, una sola serie → sin leyenda (el título ya dice qué
// se grafica, ver skill de dataviz), con crosshair + tooltip al pasar el
// mouse y el valor final rotulado directo sobre la línea.
//
// Specs de mark seguidas a mano (no hay librería de charts en el proyecto —
// se evitó sumar una dependencia nueva para un solo gráfico): línea 2px,
// punto final ≥8px con anillo de 2px color superficie, área al ~10% de
// opacidad, grillas/ejes hairline 1px recesivos.
//
// `coords` carga el punto original junto con x/y (en vez de arrays
// paralelos indexados por posición) para no depender de que dos arrays
// separados queden siempre sincronizados en longitud.

type Punto = KpiDotacionHistorica['puntos'][number]
interface Coord {
  x: number
  y: number
  punto: Punto
}

const W = 720
const H = 260
const PAD = { top: 20, right: 16, bottom: 32, left: 44 }

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

// Redondea el techo del eje Y a un número "limpio" (múltiplos de 1, 2 o 5 * 10^n).
function techoLimpio(max: number): number {
  if (max <= 0) return 10
  const magnitud = 10 ** Math.floor(Math.log10(max))
  const pasos = [1, 2, 5, 10]
  for (const p of pasos) {
    const candidato = p * magnitud
    if (candidato >= max) return candidato
  }
  return 10 * magnitud
}

const innerW = W - PAD.left - PAD.right
const innerH = H - PAD.top - PAD.bottom

export function EvolucionDotacionChart({ data }: { data: KpiDotacionHistorica | undefined }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const puntos = data?.puntos ?? []

  const { path, area, coords, yTicks, yMax } = useMemo(() => {
    const max = techoLimpio(Math.max(0, ...puntos.map((p) => p.personas)))
    const coords: Coord[] = puntos.map((punto, i) => ({
      x: puntos.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (puntos.length - 1)) * innerW,
      y: PAD.top + innerH - (punto.personas / max) * innerH,
      punto,
    }))
    const primero = coords[0]
    const ultimo = coords[coords.length - 1]
    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
    const area =
      primero && ultimo
        ? `${path} L ${ultimo.x.toFixed(1)} ${PAD.top + innerH} L ${primero.x.toFixed(1)} ${PAD.top + innerH} Z`
        : ''
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * max))
    return { path, area, coords, yTicks, yMax: max }
  }, [puntos])

  const ultimo = coords[coords.length - 1]

  if (puntos.length === 0 || !ultimo) {
    return <p className="text-sm text-gray-400">Todavía no hay snapshots de padrón aprobados para graficar.</p>
  }

  const hover = hoverIdx !== null ? coords[hoverIdx] : undefined

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * innerW
    const idx = puntos.length === 1 ? 0 : Math.round((relX / innerW) * (puntos.length - 1))
    setHoverIdx(Math.min(Math.max(idx, 0), puntos.length - 1))
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolución de dotación por fecha de padrón">
        {/* Gridlines Y — hairline recesivo */}
        {yTicks.map((t) => {
          const y = PAD.top + innerH - (t / yMax) * innerH
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#DEE2E6" strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#6C757D">
                {t.toLocaleString('es-AR')}
              </text>
            </g>
          )
        })}

        {/* Eje X — fechas */}
        {coords.map((c) => (
          <text key={c.punto.fecha} x={c.x} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={11} fill="#6C757D">
            {formatFecha(c.punto.fecha)}
          </text>
        ))}

        {/* Área (10% opacidad) + línea (2px) */}
        {area && <path d={area} fill="#0066CC" fillOpacity={0.1} stroke="none" />}
        <path d={path} fill="none" stroke="#0066CC" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Punto final + rótulo directo (valor) */}
        <circle cx={ultimo.x} cy={ultimo.y} r={5} fill="#0066CC" stroke="#FFFFFF" strokeWidth={2} />
        <text x={ultimo.x} y={ultimo.y - 12} textAnchor="end" fontSize={12} fontWeight={700} fill="#101828">
          {ultimo.punto.personas.toLocaleString('es-AR')}
        </text>

        {/* Crosshair de hover */}
        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="#38485C"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={hover.x} cy={hover.y} r={5} fill="#0066CC" stroke="#FFFFFF" strokeWidth={2} />
          </>
        )}

        {/* Capa de hit-target — todo el ancho del área de datos */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
        />
      </svg>

      {hover && (
        <div
          className="absolute bg-navy text-white text-xs rounded px-2.5 py-1.5 pointer-events-none shadow-lg -translate-x-1/2 -translate-y-full"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, marginTop: -8 }}
        >
          <p className="font-semibold">{formatFecha(hover.punto.fecha)}</p>
          <p>{hover.punto.personas.toLocaleString('es-AR')} personas</p>
          <p className="text-gray-300">{hover.punto.cargos.toLocaleString('es-AR')} cargos ocupados</p>
        </div>
      )}
    </div>
  )
}
