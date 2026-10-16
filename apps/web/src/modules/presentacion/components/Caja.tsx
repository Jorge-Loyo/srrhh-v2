import type { ReactNode, CSSProperties } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Posicionamiento absoluto por coordenadas sobre el canvas 1280×720 (como un
// cuadro de texto / forma en PowerPoint). Reemplaza el "empujar con flexbox" por
// coordenadas exactas, para replicar las slides con fidelidad.
//
// La slide que use <Caja> debe estar dentro de un contenedor `relative` que
// ocupe TODO el canvas (SlideSurface se encarga de eso).
// ─────────────────────────────────────────────────────────────────────────────

export interface CajaProps {
  /** Coordenada X del borde (px sobre el canvas 1280 de ancho). */
  x: number
  /** Coordenada Y del borde (px sobre el canvas 720 de alto). */
  y: number
  /** Ancho fijo (px). Si se omite, la caja toma el ancho de su contenido. */
  w?: number
  /** Alto fijo (px). Si se omite, toma el alto del contenido. */
  h?: number
  /** Escala del contenido (1 = tamaño natural). Útil para agrandar/achicar. */
  escala?: number
  /**
   * Punto de anclaje de (x,y): 'tl' esquina sup-izq (default), 'tc' sup-centro,
   * 'tr' sup-der, 'cl','cc','cr','bl','bc','br'. Permite centrar o lateralizar
   * respecto a (x,y) sin recalcular medidas a mano.
   */
  anclaje?: Anclaje
  /** Alineación horizontal interna del contenido. */
  align?: 'left' | 'center' | 'right'
  children: ReactNode
}

type Anclaje = 'tl' | 'tc' | 'tr' | 'cl' | 'cc' | 'cr' | 'bl' | 'bc' | 'br'

// translate según anclaje: cuánto correr la caja respecto a (x,y).
const TRANSLATE: Record<Anclaje, string> = {
  tl: '0, 0',
  tc: '-50%, 0',
  tr: '-100%, 0',
  cl: '0, -50%',
  cc: '-50%, -50%',
  cr: '-100%, -50%',
  bl: '0, -100%',
  bc: '-50%, -100%',
  br: '-100%, -100%',
}

export function Caja({ x, y, w, h, escala = 1, anclaje = 'tl', align = 'left', children }: CajaProps) {
  const transforms = [`translate(${TRANSLATE[anclaje]})`]
  if (escala !== 1) transforms.push(`scale(${escala})`)
  // El origen de la escala sigue el anclaje horizontal para que agrandar no
  // descoloque el borde de referencia.
  const origin = align === 'center' ? 'top center' : align === 'right' ? 'top right' : 'top left'

  const style: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    height: h,
    transform: transforms.join(' '),
    transformOrigin: origin,
    textAlign: align,
  }
  return <div style={style}>{children}</div>
}
