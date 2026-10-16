import type { Slide09Data } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, tituloValores } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 9 ("Dotación Activa · Cargos de estructura · CPH
// · Jefes").
//
// KPIs + gráfico de barras agrupadas horizontales (activos por jefatura, una
// serie por mes) + tabla de variación por efector (con columna "Cargos", como
// la S6). Etiquetas de meses y KPIs derivados del período.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide09Data(periodo: Periodo = PERIODO_ACTUAL): Slide09Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const valores = tituloValores(periodo)

  // Colores por mes (Ene/Feb/Mar/Abr).
  const coloresMes = ['#1A2B4A', '#5BBFBF', '#ADB5BD', '#F5BF00']

  return {
    periodo,
    tag: 'JEFES',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'Cargos de estructura · CPH',
    subtitulo2: 'Jefes',

    kpis: [
      { label: 'Cargos', value: 2112, tono: 'base' },
      { label: etiquetaMesAnio(mesInicio(periodo), periodo), value: 2102, tono: 'neutro' },
      { label: etiquetaMesAnio(mesFin(periodo), periodo), value: 2102, tono: 'destacado' },
      { label: 'Cantidad', value: 0, tono: 'diferencia' },
      { label: 'Porcentaje', value: null, displayValue: '0 %', tono: 'diferencia' },
    ],
    kpisSecundarios: chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' })),

    // ── Gráfico: activos por jefatura (barras agrupadas horizontales) ──────────
    // Una serie por mes; categorías = tipos de jefatura.
    tituloGrafico: 'Evolución activos',
    grafico: {
      orientacion: 'horizontal',
      categorias: ['Jefe de Departamento', 'Jefe de División', 'Jefe de Unidad', 'Jefe de Sección'],
      series: meses.map((nombre, i) => ({ nombre, color: coloresMes[i % coloresMes.length] })),
      // valores[categoria][serie=mes]
      valores: [
        [187, 182, 188, 189], // Jefe de Departamento
        [297, 295, 294, 296], // Jefe de División
        [840, 834, 835, 839], // Jefe de Unidad
        [778, 778, 778, 778], // Jefe de Sección
      ],
      minY: 0,
      maxY: 900,
      pasoY: 100,
    },

    // ── Tabla: variación por efector (con columna "Cargos") ────────────────────
    tablaEfector: {
      titulo: 'Variación por Efector',
      subtitulo: '% Variación cuatrim. por efector',
      columnaEtiqueta: 'Efector',
      columnaValorPrevio: 'Cargos',
      tituloValores: valores,
      decimalesPct: 2,
      meses,
      notaPie: '*Los efectores y especialidades mencionadas son los únicos que POSEEN VARIACIÓN',
      filas: [
        { etiqueta: 'Hospital Moyano', valorPrevio: 111, valores: [111, 110, 110, 109], diferencia: -2, variacionPct: -1.8 },
        { etiqueta: 'Hospital Fernández', valorPrevio: 106, valores: [104, 103, 103, 102], diferencia: -2, variacionPct: -1.92 },
        { etiqueta: 'Hospital Argerich', valorPrevio: 100, valores: [97, 95, 94, 95], diferencia: -2, variacionPct: -2.06 },
        { etiqueta: 'SS Atención Primaria', valorPrevio: 96, valores: [91, 92, 93, 93], diferencia: 2, variacionPct: 2.2 },
        { etiqueta: 'Hospital Santojanni', valorPrevio: 91, valores: [90, 90, 88, 89], diferencia: -1, variacionPct: -1.11 },
        { etiqueta: 'Hospital Borda', valorPrevio: 128, valores: [84, 85, 88, 88], diferencia: 4, variacionPct: 4.76 },
        { etiqueta: 'Hospital Elizalde', valorPrevio: 76, valores: [85, 86, 86, 86], diferencia: 1, variacionPct: 1.18 },
        { etiqueta: 'Hospital Pirovano', valorPrevio: 83, valores: [83, 83, 84, 84], diferencia: 1, variacionPct: 1.2 },
        { etiqueta: 'Hospital Piñero', valorPrevio: 75, valores: [82, 81, 81, 81], diferencia: -1, variacionPct: -1.22 },
        { etiqueta: 'Hospital Rivadavia', valorPrevio: 80, valores: [77, 77, 77, 76], diferencia: -1, variacionPct: -1.3 },
        { etiqueta: 'Hospital Alvarez', valorPrevio: 69, valores: [76, 75, 73, 73], diferencia: -3, variacionPct: -3.95 },
        { etiqueta: 'Hospital Muñiz', valorPrevio: 77, valores: [71, 71, 69, 69], diferencia: -2, variacionPct: -2.82 },
        { etiqueta: 'Hospital Tornu', valorPrevio: 60, valores: [61, 62, 60, 60], diferencia: -1, variacionPct: -1.64 },
        { etiqueta: 'Hospital Penna', valorPrevio: 60, valores: [62, 63, 60, 60], diferencia: -2, variacionPct: -3.23 },
        { etiqueta: 'Hospital Velez Sarsfield', valorPrevio: 53, valores: [51, 51, 52, 52], diferencia: 1, variacionPct: 1.96 },
        { etiqueta: 'Hospital Rocca', valorPrevio: 41, valores: [37, 37, 38, 40], diferencia: 3, variacionPct: 8.11 },
        { etiqueta: 'Hospital Illia', valorPrevio: 31, valores: [39, 40, 40, 40], diferencia: 1, variacionPct: 2.56 },
        { etiqueta: 'Hospital Carrillo', valorPrevio: 31, valores: [34, 35, 37, 37], diferencia: 3, variacionPct: 8.82 },
        { etiqueta: 'Hospital Lagleyze', valorPrevio: 30, valores: [33, 33, 34, 34], diferencia: 1, variacionPct: 3.03 },
        { etiqueta: 'Hospital Ferrer', valorPrevio: 33, valores: [33, 32, 31, 31], diferencia: -2, variacionPct: -6.06 },
        { etiqueta: 'Instituto R. Psicofísica', valorPrevio: 30, valores: [26, 26, 28, 28], diferencia: 2, variacionPct: 7.69 },
        { etiqueta: 'Hospital Quinquela Martin', valorPrevio: 23, valores: [21, 22, 22, 22], diferencia: 1, variacionPct: 4.76 },
        { etiqueta: 'Hospital Grierson', valorPrevio: 13, valores: [20, 20, 20, 21], diferencia: 1, variacionPct: 5.0 },
        { etiqueta: 'Hospital Alvear', valorPrevio: 19, valores: [20, 19, 19, 19], diferencia: -1, variacionPct: -5.0 },
        { etiqueta: 'Hospital Dueñas', valorPrevio: 24, valores: [20, 20, 19, 19], diferencia: -1, variacionPct: -5.0 },
        { etiqueta: 'Instituto de Trasplante', valorPrevio: 14, valores: [8, 8, 9, 9], diferencia: 1, variacionPct: 12.5 },
        { etiqueta: 'DG SAME', valorPrevio: 4, valores: [5, 5, 4, 4], diferencia: -1, variacionPct: -20.0 },
      ],
    },
  }
}
