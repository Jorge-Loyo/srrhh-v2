import type { Slide14Data } from './types'
import type { Periodo } from './periodo'
import { etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 14 ("Dotación Activa · Otros escalafones").
//
// KPI principal (baja: 683 → 656) + 3 filas de escalafón (Autoridades
// Superiores / Carrera Gerencial / Docentes), cada una con Cargos/inicio/fin.
// A la derecha, gráfico de barras "Abril" con aclaración.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide14Data(periodo: Periodo = PERIODO_ACTUAL): Slide14Data {
  const labelIni = etiquetaMesAnio(mesInicio(periodo), periodo)
  const labelFin = etiquetaMesAnio(mesFin(periodo), periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))

  return {
    periodo,
    tag: 'OTROS ESCALAFONES',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'Otros escalafones',

    bloque: {
      sentido: 'baja',
      kpis: [
        { label: labelIni, value: 683, tono: 'baseGris' },
        { label: labelFin, value: 656, tono: 'negativo' },
        { label: 'Cantidad', value: -26, tono: 'negativo' },
        { label: 'Porcentaje', value: null, displayValue: '-3,81 %', tono: 'diferencia' },
      ],
      kpisSecundarios: chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' })),
    },

    filas: [
      { rotulo: 'Autoridades Superiores', rotuloTono: 'naranja', cargos: 27, inicio: 27, fin: 26, finTono: 'rosa' },
      { rotulo: 'Carrera Gerencial', rotuloTono: 'rojo', cargos: 192, inicio: 181, fin: 178, finTono: 'rojo' },
      { rotulo: 'Docentes', rotuloTono: 'verde', cargos: 27, inicio: 27, fin: 26, finTono: 'rosa' },
    ],

    // ── Gráfico "Abril": composición de Carrera Gerencial por tipo ─────────────
    tituloGrafico: labelFin,
    aclaracion: {
      titulo: 'Aclaración',
      lineas: ['En este gráfico no se encuentran', 'incluidas las Autoridades Superiores.'],
    },
    grafico: {
      barras: [
        { etiqueta: 'Subgerentes', valor: 109, color: '#1A2B4A' },
        { etiqueta: 'Gerentes', valor: 69, color: '#5BBFBF' },
        { etiqueta: 'Cuerpo de profesionales', valor: 62, color: '#F5BF00' },
        { etiqueta: 'Planta de Gabinete', valor: 37, color: '#ADB5BD' },
      ],
      minY: 0,
      maxY: 120,
      pasoY: 20,
    },
  }
}
