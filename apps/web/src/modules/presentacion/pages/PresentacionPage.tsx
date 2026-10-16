import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '../components/SlideCanvas'
import { Slide04Dotacion } from '../slides/Slide04Dotacion'
import { Slide05CphPlanta } from '../slides/Slide05CphPlanta'
import { Slide06CphGuardia } from '../slides/Slide06CphGuardia'
import { Slide07CphGuardiaEfector } from '../slides/Slide07CphGuardiaEfector'
import { Slide08SuplentesGuardia } from '../slides/Slide08SuplentesGuardia'
import { Slide09CargosEstructura } from '../slides/Slide09CargosEstructura'
import { Slide10Enfermeria } from '../slides/Slide10Enfermeria'
import { Slide11Tecnicos } from '../slides/Slide11Tecnicos'
import { buildSlide04Data } from '../data/slide04.mock'
import { buildSlide05Data } from '../data/slide05.mock'
import { buildSlide06Data } from '../data/slide06.mock'
import { buildSlide07Data } from '../data/slide07.mock'
import { buildSlide08Data } from '../data/slide08.mock'
import { buildSlide09Data } from '../data/slide09.mock'
import { buildSlide10Data } from '../data/slide10.mock'
import { buildSlide11Data } from '../data/slide11.mock'
import { PERIODO_ACTUAL } from '../data/periodoActual'
import type { Periodo } from '../data/periodo'

// ─────────────────────────────────────────────────────────────────────────────
// Reporte de presentación (~60 slides).
//
// MODELO: el reporte se GENERA automáticamente para un período y el front lo
// PLASMA (sólo render, sin edición ni navegación de autor). Por eso las slides
// se apilan verticalmente — una debajo de otra, listas para ver/imprimir/PDF.
//
// Cada slide se dibuja en un canvas 16:9 FIJO (1280×720) y se escala para entrar
// en el ancho disponible (manteniendo proporción). Al imprimir, cada slide cae
// en su propia página (ver index.css: @media print del .presentacion).
//
// PERÍODO: hoy fijo (PERIODO_ACTUAL). Cuando exista el backend, la generación se
// pedirá para un período concreto y el reporte llegará ya resuelto para ese
// período — las funciones build*(periodo) se reemplazan por el fetch y nada más
// cambia acá.
// ─────────────────────────────────────────────────────────────────────────────

function buildSlides(periodo: Periodo): { numero: number; node: ReactNode }[] {
  return [
    { numero: 4, node: <Slide04Dotacion data={buildSlide04Data(periodo)} numero={4} /> },
    { numero: 5, node: <Slide05CphPlanta data={buildSlide05Data(periodo)} numero={5} /> },
    { numero: 6, node: <Slide06CphGuardia data={buildSlide06Data(periodo)} numero={6} /> },
    { numero: 7, node: <Slide07CphGuardiaEfector data={buildSlide07Data(periodo)} numero={7} /> },
    { numero: 8, node: <Slide08SuplentesGuardia data={buildSlide08Data(periodo)} numero={8} /> },
    { numero: 9, node: <Slide09CargosEstructura data={buildSlide09Data(periodo)} numero={9} /> },
    { numero: 10, node: <Slide10Enfermeria data={buildSlide10Data(periodo)} numero={10} /> },
    { numero: 11, node: <Slide11Tecnicos data={buildSlide11Data(periodo)} numero={11} /> },
  ]
}

export function PresentacionPage() {
  // Período del reporte. Fijo por ahora; lo define la generación del backend.
  const periodo = PERIODO_ACTUAL
  const slides = buildSlides(periodo)

  // ── Escala del canvas al ancho disponible ───────────────────────────────────
  // Cada slide es 1280×720 fijo; se escala para ocupar el ancho de la columna
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

  return (
    <div className="presentacion min-h-screen w-full bg-gray-200 overflow-y-auto">
      <div ref={contenedorRef} className="mx-auto max-w-[1280px] px-4 py-6 flex flex-col items-center gap-6">
        {slides.map((s) => (
          <div
            key={s.numero}
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
              {s.node}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
