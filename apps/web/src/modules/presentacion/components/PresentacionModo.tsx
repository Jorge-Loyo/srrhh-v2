import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from './SlideCanvas'
import { SLIDES_CATALOGO } from './slidesCatalogo'
import { PERIODO_ACTUAL } from '../data/periodoActual'
import type { Periodo } from '../data/periodo'

// ─────────────────────────────────────────────────────────────────────────────
// Modo presentación (pase de diapositivas) fullscreen.
//
// A diferencia de SlidesViewer (que apila los slides escalados al ANCHO del
// contenedor), este componente muestra UN slide por vez, centrado y escalado
// "contain" (limitado por ancho Y alto) sobre un overlay oscuro que cubre toda
// la ventana. Pensado para proyectar los 8 slides (4–11) como una presentación.
//
// Se monta vía portal a document.body para escapar del stacking/overflow del
// layout de Reportes. Recorre SLIDES_CATALOGO (única fuente de los slides) y
// reutiliza SLIDE_WIDTH/SLIDE_HEIGHT de SlideCanvas; no hardcodea tamaños ni la
// lista de slides.
// ─────────────────────────────────────────────────────────────────────────────

interface PresentacionModoProps {
  /** Cierra el overlay y vuelve a la vista normal de Reportes. */
  onClose: () => void
  /** Período del reporte. Fijo por defecto; lo definirá el backend. */
  periodo?: Periodo
  /**
   * Período de comparación (D1). En Reportes el usuario elige un rango
   * comparativo: `consulta` viaja por `periodo` (canal existente) y
   * `comparacion` por esta prop opcional nueva. Por ahora solo se TRANSPORTA:
   * los mocks todavía no la consumen. /presentacion no la pasa.
   */
  comparacion?: Periodo
}

// `comparacion` se acepta y transporta pero aún no se consume (los mocks no la
// usan todavía); por eso no se desestructura en el cuerpo.
export function PresentacionModo({ onClose, periodo = PERIODO_ACTUAL }: PresentacionModoProps) {
  const total = SLIDES_CATALOGO.length
  // Índice del slide actual (0 = slide 4, el primero del catálogo).
  const [indice, setIndice] = useState(0)

  // Contenedor que se enfoca al abrir, para que las teclas funcionen de entrada.
  const overlayRef = useRef<HTMLDivElement>(null)
  // Control accionable que recibe el foco inicial al abrir (anillo visible).
  const botonSiguienteRef = useRef<HTMLButtonElement>(null)
  // Área central donde vive el slide; se mide para calcular la escala contain.
  const areaRef = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)

  // ── Escala "contain": el slide entero (1280×720) entra en el área central ────
  // Limitada por ancho Y alto (a diferencia del SlidesViewer, que solo usa el
  // ancho). No se agranda más allá de 1:1 para no pixelar.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const recalcular = () => {
      const ancho = el.clientWidth
      const alto = el.clientHeight
      setEscala(Math.min(ancho / SLIDE_WIDTH, alto / SLIDE_HEIGHT, 1))
    }
    recalcular()
    const ro = new ResizeObserver(recalcular)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Navegación por teclado: ←/→ cambian slide, Escape cierra ────────────────
  // Además, focus-trap con Tab/Shift+Tab: el foco cicla solo entre los
  // controles accionables del overlay (cerrar, Anterior/Siguiente habilitados)
  // sin escaparse a los controles de Reportes que quedan detrás.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setIndice((i) => Math.min(i + 1, total - 1))
      } else if (e.key === 'ArrowLeft') {
        setIndice((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Tab') {
        const overlay = overlayRef.current
        if (!overlay) return
        // Solo botones accionables (se excluyen Anterior/Siguiente disabled).
        const focuseables = Array.from(
          overlay.querySelectorAll<HTMLElement>('button:not([disabled])'),
        )
        if (focuseables.length === 0) return
        const primero = focuseables[0]
        const ultimo = focuseables[focuseables.length - 1]
        const activo = document.activeElement
        if (e.shiftKey) {
          // Shift+Tab desde el primero (o fuera del ciclo) → salta al último.
          if (activo === primero || !overlay.contains(activo)) {
            e.preventDefault()
            ultimo.focus()
          }
        } else {
          // Tab desde el último (o fuera del ciclo) → salta al primero.
          if (activo === ultimo || !overlay.contains(activo)) {
            e.preventDefault()
            primero.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [total, onClose])

  // ── Foco inicial en un control accionable (anillo de foco visible) ──────────
  // Enfoca "Siguiente" al abrir; si no está disponible, cae al overlay para que
  // las teclas globales (←/→/Escape) sigan funcionando de entrada.
  useEffect(() => {
    const destino = botonSiguienteRef.current ?? overlayRef.current
    destino?.focus()
  }, [])

  // ── Bloquear el scroll del body mientras el overlay está abierto ────────────
  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [])

  const item = SLIDES_CATALOGO[indice]
  const Component = item.Component
  const esPrimero = indice === 0
  const esUltimo = indice === total - 1

  const irAnterior = () => setIndice((i) => Math.max(i - 1, 0))
  const irSiguiente = () => setIndice((i) => Math.min(i + 1, total - 1))

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Presentación de slides"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-navy/95 outline-none"
    >
      {/* ── Barra superior: título del slide + indicador + cerrar ──────────── */}
      <header className="flex items-center justify-between gap-4 px-6 py-3 text-white">
        <span className="font-primary text-sm font-semibold">
          {`${item.numero} · ${item.titulo}`}
        </span>
        <div className="flex items-center gap-4">
          <span className="font-primary text-sm tabular-nums text-white/80">
            {`${indice + 1} / ${total}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar presentación"
            className="rounded-md p-1.5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── Área central: el slide actual, escalado "contain" y centrado ────── */}
      <div ref={areaRef} className="flex flex-1 items-center justify-center overflow-hidden px-6">
        <div
          style={{
            width: SLIDE_WIDTH * escala,
            height: SLIDE_HEIGHT * escala,
          }}
          className="shrink-0"
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
      </div>

      {/* ── Barra inferior: navegación Anterior / Siguiente ────────────────── */}
      <footer className="flex items-center justify-center gap-4 px-6 py-4">
        <button
          type="button"
          onClick={irAnterior}
          disabled={esPrimero}
          aria-label="Slide anterior"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 font-primary text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          Anterior
        </button>
        <button
          ref={botonSiguienteRef}
          type="button"
          onClick={irSiguiente}
          disabled={esUltimo}
          aria-label="Slide siguiente"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 font-primary text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
        >
          Siguiente
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </footer>
    </div>,
    document.body,
  )
}
