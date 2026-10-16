import type { Slide08Data } from './types'
import type { Periodo } from './periodo'
import { etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, nombresMeses } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 8 ("Dotación Activa · Suplentes de Guardia").
//
// Dos bloques de KPIs comparativos:
//  · Crecimiento (activos): Enero → Abril, sube (+54, 0,9 %).
//  · Decrecimiento (suplentes): Enero → Abril, baja (-108, -2,72 %).
// Y un gráfico de barras con los suplentes por mes.
//
// Las etiquetas de meses y los chips derivan del período. Cuando exista el
// endpoint, el backend devolverá estos campos para el período solicitado.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide08Data(periodo: Periodo = PERIODO_ACTUAL): Slide08Data {
  const labelIni = etiquetaMesAnio(mesInicio(periodo), periodo)
  const labelFin = etiquetaMesAnio(mesFin(periodo), periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const meses = nombresMeses(periodo)

  // Suplentes por mes (los del gráfico). Orden = meses del período.
  const suplentes = [3965, 3917, 3844, 3857]

  // Colores de las barras, uno por mes (navy / amarillo / teja / teal).
  const coloresBarras = ['#1A2B4A', '#F5BF00', '#C0564B', '#5BBFBF']

  return {
    periodo,
    tag: 'GUARDIA',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'Suplentes de Guardia',
    subtitulo2: 'Jefes incluidos',

    bloques: [
      // ── Crecimiento (activos) ──────────────────────────────────────────────
      {
        sentido: 'sube',
        kpis: [
          { label: labelIni, value: 5573, tono: 'neutro' },
          { label: labelFin, value: 5627, tono: 'destacado' },
          { label: 'Cantidad', value: 54, tono: 'diferencia' },
          { label: 'Porcentaje', value: null, displayValue: '0,9 %', tono: 'diferencia' },
        ],
        kpisSecundarios: chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' })),
      },
      // ── Decrecimiento (suplentes) ──────────────────────────────────────────
      {
        sentido: 'baja',
        kpis: [
          { label: labelIni, value: 3965, tono: 'baseGris' },
          { label: labelFin, value: 3857, tono: 'negativo' },
          { label: 'Cantidad', value: -108, tono: 'negativo' },
          { label: 'Porcentaje', value: null, displayValue: '-2,72 %', tono: 'diferencia' },
        ],
        kpisSecundarios: [],
      },
    ],

    // ── Gráfico: suplentes por mes ─────────────────────────────────────────────
    grafico: {
      barras: meses.map((etiqueta, i) => ({
        etiqueta: `${etiqueta} ${periodo.anio}`,
        valor: suplentes[i] ?? null,
        color: coloresBarras[i % coloresBarras.length],
      })),
      minY: 3780,
      maxY: 3980,
      pasoY: 20,
    },
  }
}
