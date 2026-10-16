import type { ReactNode } from 'react'
import { ReglaGuia, guiaActiva } from './ReglaGuia'

// ─────────────────────────────────────────────────────────────────────────────
// Shell de slide reutilizable para toda la presentación (~60 slides).
//
// Canvas 16:9 FIJO (1280×720) centrado. El tamaño es constante y conocido, así
// cada slide se maqueta con medidas estables (como en un PPT) sin reflow al
// cambiar el viewport. El escalado al tamaño real de pantalla lo resuelve el
// contenedor del deck (ver PresentacionPage), no cada slide.
//
// Dos modos de maquetación del contenido:
//  · 'flujo'    (default) área con margen seguro + flexbox. Para slides simples.
//  · 'absoluto' canvas completo; la slide posiciona con <Caja> por coordenadas
//               (como PowerPoint), para replicar layouts con fidelidad.
//
// Regla de ayuda: agregá `?guia` a la URL para ver la grilla/centros/tercios.
//
// Estética: tema Obelisco del sistema.
// ─────────────────────────────────────────────────────────────────────────────

/** Dimensiones canónicas del canvas. Exportadas para que el deck calcule la escala. */
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

/** Logo institucional del pie de slide (Buenos Aires Ciudad). */
const LOGO_URL = 'https://res.cloudinary.com/olddxilu/image/upload/v1792096851/BANNER_FORMS_13.png'

interface SlideCanvasProps {
  /** Número de slide mostrado en el footer. */
  numero: number
  /** Contenido de la slide. */
  children: ReactNode
  /** Oculta el pie (logo + número) si una slide lo necesita a medida (ej: carátula). */
  conFooter?: boolean
  /** Modo de maquetación del contenido. Default 'flujo'. */
  modo?: 'flujo' | 'absoluto'
}

export function SlideCanvas({ numero, children, conFooter = true, modo = 'flujo' }: SlideCanvasProps) {
  return (
    <div
      className="relative bg-surface overflow-hidden font-secondary text-gray-800 shadow-lg"
      style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
    >
      {modo === 'absoluto' ? (
        // Canvas completo: la slide posiciona cada elemento con <Caja>.
        <div className="absolute inset-0">{children}</div>
      ) : (
        // Área de contenido con margen seguro + flexbox.
        <div
          className="absolute flex flex-col overflow-hidden"
          style={{ top: 28, left: 40, right: 40, bottom: conFooter ? 72 : 28 }}
        >
          {children}
        </div>
      )}

      {guiaActiva() && <ReglaGuia />}

      {conFooter && (
        <footer className="absolute inset-x-0 bottom-0 h-16 px-8 flex items-center justify-between">
          {/* Logo institucional dentro de un recuadro blanco con margen, para
              que quede prolijo y despegado del borde de la slide. */}
          <div className="bg-white rounded-md p-2 shadow-sm">
            <img src={LOGO_URL} alt="Buenos Aires Ciudad" className="h-11 w-auto block" />
          </div>
          <span className="font-bold text-gray-500 text-sm">{numero}</span>
        </footer>
      )}
    </div>
  )
}
