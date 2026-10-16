import { SLIDE_WIDTH, SLIDE_HEIGHT } from './SlideCanvas'

// ─────────────────────────────────────────────────────────────────────────────
// Regla / grid de ayuda para ubicar elementos con precisión mientras se diseña.
// Dibuja: marcas cada 40px en los bordes, líneas de tercios y las líneas de
// centro (vertical y horizontal). Es una AYUDA de diseño — no va al reporte
// final; se enciende con la query `?guia` en la URL o editando MOSTRAR_GUIA.
// ─────────────────────────────────────────────────────────────────────────────

export function guiaActiva(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('guia')
}

export function ReglaGuia() {
  const paso = 40
  const vx: number[] = []
  for (let x = paso; x < SLIDE_WIDTH; x += paso) vx.push(x)
  const vy: number[] = []
  for (let y = paso; y < SLIDE_HEIGHT; y += paso) vy.push(y)

  const cx = SLIDE_WIDTH / 2
  const cy = SLIDE_HEIGHT / 2
  const tx1 = SLIDE_WIDTH / 3
  const tx2 = (SLIDE_WIDTH * 2) / 3
  const ty1 = SLIDE_HEIGHT / 3
  const ty2 = (SLIDE_HEIGHT * 2) / 3

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-50"
      width={SLIDE_WIDTH}
      height={SLIDE_HEIGHT}
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
    >
      {/* Grilla fina cada 40px */}
      {vx.map((x) => (
        <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={SLIDE_HEIGHT} stroke="#60A5FA" strokeOpacity={0.12} strokeWidth={1} />
      ))}
      {vy.map((y) => (
        <line key={`vy${y}`} x1={0} y1={y} x2={SLIDE_WIDTH} y2={y} stroke="#60A5FA" strokeOpacity={0.12} strokeWidth={1} />
      ))}

      {/* Tercios */}
      {[tx1, tx2].map((x) => (
        <line key={`t${x}`} x1={x} y1={0} x2={x} y2={SLIDE_HEIGHT} stroke="#A855F7" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="6 4" />
      ))}
      {[ty1, ty2].map((y) => (
        <line key={`t${y}`} x1={0} y1={y} x2={SLIDE_WIDTH} y2={y} stroke="#A855F7" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="6 4" />
      ))}

      {/* Centros */}
      <line x1={cx} y1={0} x2={cx} y2={SLIDE_HEIGHT} stroke="#EF4444" strokeOpacity={0.7} strokeWidth={1} />
      <line x1={0} y1={cy} x2={SLIDE_WIDTH} y2={cy} stroke="#EF4444" strokeOpacity={0.7} strokeWidth={1} />

      {/* Etiquetas numéricas cada 80px en los ejes */}
      {vx.filter((x) => x % 80 === 0).map((x) => (
        <text key={`lx${x}`} x={x + 2} y={10} fontSize={8} fill="#2563EB" fillOpacity={0.6}>
          {x}
        </text>
      ))}
      {vy.filter((y) => y % 80 === 0).map((y) => (
        <text key={`ly${y}`} x={2} y={y - 2} fontSize={8} fill="#2563EB" fillOpacity={0.6}>
          {y}
        </text>
      ))}
    </svg>
  )
}
