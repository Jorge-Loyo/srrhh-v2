import type { ReactNode } from 'react'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from './SlideCanvas'

// ─────────────────────────────────────────────────────────────────────────────
// Sistema de 4 cuadrantes sobre el canvas 1280×720.
//
// La slide se divide en 4 rectángulos (sup-izq, sup-der, inf-izq, inf-der) por
// las líneas de centro. Cada cuadrante tiene:
//  · un MARGEN externo (separa del borde del canvas y de los otros cuadrantes),
//  · un PADDING interno opcional,
// de modo que el contenido de un cuadrante JAMÁS invade a otro: así se eliminan
// los solapamientos por construcción. Cada elemento vive en su cuadrante.
//
// También se puede ocupar media slide entera (zona 'izquierda'/'derecha' = dos
// cuadrantes apilados) o una banda ('arriba'/'abajo') cuando un elemento
// (tabla larga, header) necesita todo el alto o ancho de medio canvas.
// ─────────────────────────────────────────────────────────────────────────────

export type Zona =
  | 'sup-izq'
  | 'sup-der'
  | 'inf-izq'
  | 'inf-der'
  | 'izquierda' // columna izquierda completa (sup-izq + inf-izq)
  | 'derecha' // columna derecha completa (sup-der + inf-der)
  | 'arriba' // fila superior completa
  | 'abajo' // fila inferior completa

/** Margen externo del área útil respecto al borde del canvas. */
const MARGEN = 36
/** Separación (canaleta) entre cuadrantes, a cada lado de las líneas de centro. */
const GUTTER = 16

const CX = SLIDE_WIDTH / 2
const CY = SLIDE_HEIGHT / 2

// Rectángulo (left, top, width, height) de cada zona, ya con márgenes/gutter.
function rectDeZona(zona: Zona): { left: number; top: number; width: number; height: number } {
  const L = MARGEN
  const R = SLIDE_WIDTH - MARGEN
  const T = MARGEN
  const B = SLIDE_HEIGHT - MARGEN
  const midXizq = CX - GUTTER
  const midXder = CX + GUTTER
  const midYsup = CY - GUTTER
  const midYinf = CY + GUTTER

  switch (zona) {
    case 'sup-izq':
      return { left: L, top: T, width: midXizq - L, height: midYsup - T }
    case 'sup-der':
      return { left: midXder, top: T, width: R - midXder, height: midYsup - T }
    case 'inf-izq':
      return { left: L, top: midYinf, width: midXizq - L, height: B - midYinf }
    case 'inf-der':
      return { left: midXder, top: midYinf, width: R - midXder, height: B - midYinf }
    case 'izquierda':
      return { left: L, top: T, width: midXizq - L, height: B - T }
    case 'derecha':
      return { left: midXder, top: T, width: R - midXder, height: B - T }
    case 'arriba':
      return { left: L, top: T, width: R - L, height: midYsup - T }
    case 'abajo':
      return { left: L, top: midYinf, width: R - L, height: B - midYinf }
  }
}

type AlignH = 'start' | 'center' | 'end'
type AlignV = 'start' | 'center' | 'end'

const JUSTIFY: Record<AlignV, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end' }
const ITEMS: Record<AlignH, string> = { start: 'items-start', center: 'items-center', end: 'items-end' }

interface Props {
  zona: Zona
  /** Alineación horizontal del contenido dentro del cuadrante. Default 'start'. */
  alignH?: AlignH
  /** Alineación vertical del contenido dentro del cuadrante. Default 'start'. */
  alignV?: AlignV
  /** Padding interno uniforme (margen blanco) en px. Default 8. */
  padding?: number
  /** Padding-top extra (ej: dejar lugar al header en zonas superiores/derecha). */
  pt?: number
  children: ReactNode
}

export function Cuadrante({ zona, alignH = 'start', alignV = 'start', padding = 8, pt, children }: Props) {
  const r = rectDeZona(zona)
  return (
    <div
      className={`absolute flex flex-col overflow-hidden ${JUSTIFY[alignV]} ${ITEMS[alignH]}`}
      style={{
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        padding,
        paddingTop: pt ?? padding,
      }}
    >
      {children}
    </div>
  )
}
