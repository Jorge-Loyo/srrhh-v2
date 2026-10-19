import type { BloqueKpi } from '../data/types'
import { CajonKpi, ChipKpi, CajaResumen, BadgeBloque, FlechaTendencia } from './kpiPiezas'

// ─────────────────────────────────────────────────────────────────────────────
// Bloque KPI comparativo COMPLETO, maquetado con flujo interno (flexbox + gaps).
//
// Clave anti-solapamiento: todo el bloque (badge → fila[cajones+flecha+resumen]
// → chips) se apila con separación REAL por flujo. Nunca se pisa internamente,
// porque no hay coordenadas sueltas acá adentro. La slide sólo ubica el BLOQUE
// entero con <Caja>, y entre bloques se garantiza margen con la posición.
//
// Estructura esperada en `bloque.kpis`:
//   [0] cajón inicio, [1] cajón fin, [2] resumen "Cantidad", [3] resumen "%"
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  bloque: BloqueKpi
}

export function BloqueKpiComparativo({ bloque }: Props) {
  const [inicio, fin, ...resumen] = bloque.kpis

  return (
    <div className="inline-flex flex-col gap-1.5">
      {bloque.etiqueta && <BadgeBloque texto={bloque.etiqueta} tono={bloque.etiquetaTono ?? 'navy'} />}

      <div className="flex items-stretch gap-3">
        {/* Cajones + flecha + chips (columna izquierda del bloque) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            {inicio && <CajonKpi kpi={inicio} />}
            {fin && <FlechaTendencia sentido={bloque.sentido} />}
            {fin && <CajonKpi kpi={fin} />}
          </div>
          {bloque.kpisSecundarios.length > 0 && (
            <div className="flex gap-1.5">
              {bloque.kpisSecundarios.map((k) => (
                <ChipKpi key={k.label} kpi={k} />
              ))}
            </div>
          )}
        </div>

        {/* Cajas-resumen (columna derecha del bloque), separadas por el gap-3 */}
        {resumen.length > 0 && (
          <div className="flex flex-col gap-1.5 justify-center">
            {resumen.map((k) => (
              <CajaResumen key={k.label} kpi={k} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
