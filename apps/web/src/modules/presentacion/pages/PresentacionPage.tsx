import { SlidesViewer } from '../components/SlidesViewer'
import { SLIDES_CATALOGO } from '../components/slidesCatalogo'
import { PERIODO_ACTUAL } from '../data/periodoActual'

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
// El render + escalado lo resuelve SlidesViewer (reutilizable). Esta página sólo
// aporta el marco `.presentacion` del deck; el viewer es su único hijo directo,
// para que el `@media print` (`.presentacion > div`) siga aplicando igual.
//
// PERÍODO: hoy fijo (PERIODO_ACTUAL). Cuando exista el backend, la generación se
// pedirá para un período concreto y el reporte llegará ya resuelto para ese
// período — las funciones build*(periodo) se reemplazan por el fetch y nada más
// cambia acá.
// ─────────────────────────────────────────────────────────────────────────────

export function PresentacionPage() {
  // Período del reporte. Fijo por ahora; lo define la generación del backend.
  const periodo = PERIODO_ACTUAL

  return (
    <div className="presentacion min-h-screen w-full bg-gray-200 overflow-y-auto">
      <SlidesViewer numeros={SLIDES_CATALOGO.map((s) => s.numero)} periodo={periodo} />
    </div>
  )
}
