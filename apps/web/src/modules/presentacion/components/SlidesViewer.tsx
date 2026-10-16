import { useLayoutEffect, useRef, useState } from 'react'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from './SlideCanvas'
import { SLIDES_CATALOGO } from './slidesCatalogo'
import { PERIODO_ACTUAL } from '../data/periodoActual'
import type { Periodo } from '../data/periodo'

// ─────────────────────────────────────────────────────────────────────────────
// Viewer reutilizable de slides.
//
// Encapsula "renderizar uno o varios slides escalados al ancho del contenedor".
// Lógica extraída de PresentacionPage: cada slide es 1280×720 FIJO y se escala
// (sin deformar) para entrar en el ancho de SU propio contenedor, reservando el
// alto escalado para que el apilado vertical quede correcto.
//
// Como el escalado se mide sobre el contenedor propio del viewer, sirve igual
// en /presentacion (columna ancha, los 8 slides) y en /reportes (columna más
// angosta, uno o todos) sin ningún ajuste extra.
//
// Importante para la impresión: el viewer NO pone la clase `.presentacion` (la
// pone la página contenedora). Sí pone los wrappers `.pres-slide-wrap` con el
// `<div>` escalado adentro, que es lo que el `@media print` de index.css espera.
// ─────────────────────────────────────────────────────────────────────────────

interface SlidesViewerProps {
  /** Números de slide a mostrar, en orden (ej: [4] para uno; [4..11] para todos). */
  numeros: number[]
  /** Período del reporte. Fijo por defecto; lo definirá el backend. */
  periodo?: Periodo
  /** Clases del contenedor. Default: layout del deck (/presentacion). */
  className?: string
}

export function SlidesViewer({
  numeros,
  periodo = PERIODO_ACTUAL,
  className = 'mx-auto max-w-[1280px] px-4 py-6 flex flex-col items-center gap-6',
}: SlidesViewerProps) {
  // ── Escala del canvas al ancho disponible ───────────────────────────────────
  // Cada slide es 1280×720 fijo; se escala para ocupar el ancho del contenedor
  // sin deformar. El contenedor reserva la altura escalada para que el flujo
  // vertical quede correcto.
  const contenedorRef = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)

  useLayoutEffect(() => {
    const el = contenedorRef.current
    if (!el) return
    const recalcular = () => {
      const ancho = el.clientWidth
      // No agrandar más allá de 1:1 para no pixelar; sí achicar si no entra.
      setEscala(Math.min(ancho / SLIDE_WIDTH, 1))
    }
    recalcular()
    const ro = new ResizeObserver(recalcular)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Resuelve los items del catálogo para los números pedidos (en el orden dado).
  const items = numeros
    .map((n) => SLIDES_CATALOGO.find((s) => s.numero === n))
    .filter((s): s is NonNullable<typeof s> => s != null)

  return (
    <div ref={contenedorRef} className={className}>
      {items.map((item) => {
        const Component = item.Component
        return (
          <div
            key={item.numero}
            className="pres-slide-wrap shrink-0"
            // Reserva el alto escalado para que el apilado vertical sea correcto.
            style={{ width: SLIDE_WIDTH * escala, height: SLIDE_HEIGHT * escala }}
          >
            <div
              style={{
                width: SLIDE_WIDTH,
                height: SLIDE_HEIGHT,
                transform: `scale(${escala})`,
                transformOrigin: 'top left',
              }}
            >
              <Component data={item.build(periodo)} numero={item.numero} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
