import type { ReactNode } from 'react'
import { ReglaGuia, guiaActiva } from './ReglaGuia'

// ─────────────────────────────────────────────────────────────────────────────
// Shell de slide reutilizable para toda la presentación (~60 slides).
//
// Canvas 16:9 FIJO (1280×720) centrado. El tamaño es constante y conocido, así
// cada slide se maqueta con medidas estables (como un PPT) sin reflow al cambiar
// el viewport. El escalado a pantalla lo resuelve el deck (PresentacionPage).
//
// Dos modos de maquetación del contenido:
//  · 'flujo'    (default) área con margen seguro + flexbox.
//  · 'absoluto' canvas completo; la slide posiciona con <Caja> o <Cuadrante>.
//
// Sin logo al pie (se quitó para ganar espacio vertical); sólo queda el número
// de slide, chico, en la esquina inferior derecha.
//
// Regla de ayuda: agregá `?guia` a la URL para ver la grilla/centros/tercios.
// Estética: tema Obelisco.
// ─────────────────────────────────────────────────────────────────────────────

/** Dimensiones canónicas del canvas. Exportadas para que el deck calcule la escala. */
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

interface SlideCanvasProps {
  /** Número de slide mostrado en la esquina. */
  numero: number
  /** Contenido de la slide. */
  children: ReactNode
  /** Oculta el número de slide si una slide lo necesita a medida (ej: carátula). */
  conPie?: boolean
  /** Modo de maquetación del contenido. Default 'flujo'. */
  modo?: 'flujo' | 'absoluto'
}

export function SlideCanvas({ numero, children, conPie = true, modo = 'flujo' }: SlideCanvasProps) {
  return (
    <div
      className="relative bg-surface overflow-hidden font-secondary text-gray-800 shadow-lg"
      style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
    >
      {modo === 'absoluto' ? (
        // Canvas completo: la slide posiciona con <Caja> / <Cuadrante>.
        <div className="absolute inset-0">{children}</div>
      ) : (
        // Área de contenido con margen seguro + flexbox.
        <div className="absolute flex flex-col overflow-hidden" style={{ top: 28, left: 40, right: 40, bottom: 28 }}>
          {children}
        </div>
      )}

      {guiaActiva() && <ReglaGuia />}

      {conPie && (
        <span className="absolute bottom-2 right-4 font-bold text-gray-400 text-xs z-40">{numero}</span>
      )}
    </div>
  )
}
