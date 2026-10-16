import type { Slide10Data } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, tituloValores } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 10 ("Dotación Activa · Enfermería").
//
// Dos bloques de KPIs (Dotación total ↑ / Jefes ↓), gráfico de barras agrupadas
// verticales (3 series: Licenciados/Profesionales/Auxiliares por mes) y tabla
// de variación por efector. Etiquetas/meses derivados del período.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide10Data(periodo: Periodo = PERIODO_ACTUAL): Slide10Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const labelIni = etiquetaMesAnio(mesInicio(periodo), periodo)
  const labelFin = etiquetaMesAnio(mesFin(periodo), periodo)
  const valores = tituloValores(periodo)

  const chipsCompletar = chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' }))

  return {
    periodo,
    tag: 'ENFERMERÍA',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'Enfermería',

    bloques: [
      {
        etiqueta: 'Dotación total',
        etiquetaTono: 'amarillo',
        sentido: 'sube',
        kpis: [
          { label: labelIni, value: 9852, tono: 'neutro' },
          { label: labelFin, value: 9875, tono: 'destacado' },
          { label: 'Cantidad', value: 23, tono: 'diferencia' },
          { label: 'Porcentaje', value: null, displayValue: '0,44 %', tono: 'diferencia' },
        ],
        kpisSecundarios: chipsCompletar,
      },
      {
        etiqueta: 'Jefes',
        etiquetaTono: 'rojo',
        sentido: 'baja',
        kpis: [
          { label: labelIni, value: 771, tono: 'baseGris' },
          { label: labelFin, value: 768, tono: 'negativo' },
          { label: 'Cantidad', value: -3, tono: 'negativo' },
          { label: 'Porcentaje', value: null, displayValue: '-0,39 %', tono: 'diferencia' },
        ],
        kpisSecundarios: chipsCompletar,
      },
    ],

    // ── Gráfico: variación en el tiempo por tipo (barras agrupadas verticales) ──
    // Categorías = meses; series = tipos (Licenciados/Profesionales/Auxiliares).
    tituloGrafico: 'Por Tipo',
    subtituloGrafico: 'Variación en el tiempo',
    grafico: {
      orientacion: 'vertical',
      categorias: meses,
      series: [
        { nombre: 'Licenciados', color: '#1A2B4A' },
        { nombre: 'Profesionales', color: '#C0564B' },
        { nombre: 'Auxiliares', color: '#F5BF00' },
      ],
      // valores[mes][serie]
      valores: [
        [4912, 4371, 619], // Enero
        [4929, 4377, 612], // Febrero
        [5009, 4372, 604], // Marzo
        [5002, 4367, 596], // Abril
      ],
      minY: 0,
      maxY: 5500,
      pasoY: 500,
    },

    // ── Tabla: variación por efector (sin columna Cargos) ──────────────────────
    tablaEfector: {
      titulo: 'Variación por Efector',
      subtitulo: '% Variación cuatrimestral por efector',
      columnaEtiqueta: 'Efector',
      tituloValores: valores,
      decimalesPct: 2,
      meses,
      notaPie: '*Los efectores y especialidades mencionadas son los únicos que POSEEN VARIACIÓN',
      filas: [
        { etiqueta: 'Gutierrez', valores: [633, 630, 638, 640], diferencia: 7, variacionPct: 1.11 },
        { etiqueta: 'Fernandez', valores: [580, 577, 574, 569], diferencia: -11, variacionPct: -1.9 },
        { etiqueta: 'Durand', valores: [561, 563, 563, 563], diferencia: 2, variacionPct: 0.36 },
        { etiqueta: 'Ramos Mejia', valores: [566, 562, 560, 559], diferencia: -7, variacionPct: -1.24 },
        { etiqueta: 'Argerich', valores: [548, 545, 543, 541], diferencia: -7, variacionPct: -1.28 },
        { etiqueta: 'Santojanni', valores: [533, 536, 542, 530], diferencia: -3, variacionPct: -0.56 },
        { etiqueta: 'Muñiz', valores: [508, 509, 506, 503], diferencia: -5, variacionPct: -0.98 },
        { etiqueta: 'Penna', valores: [454, 457, 461, 467], diferencia: 13, variacionPct: 2.86 },
        { etiqueta: 'Piñero', valores: [467, 468, 464, 464], diferencia: -3, variacionPct: -0.64 },
        { etiqueta: 'Elizalde', valores: [459, 448, 464, 462], diferencia: 3, variacionPct: 0.65 },
        { etiqueta: 'Pirovano', valores: [395, 393, 404, 405], diferencia: 10, variacionPct: 2.53 },
        { etiqueta: 'Sarda', valores: [357, 357, 357, 361], diferencia: 4, variacionPct: 1.12 },
        { etiqueta: 'Borda', valores: [328, 328, 328, 348], diferencia: 20, variacionPct: 6.1 },
        { etiqueta: 'Alvarez', valores: [323, 324, 328, 327], diferencia: 4, variacionPct: 1.24 },
        { etiqueta: 'SS. Atención Primaria', valores: [305, 307, 309, 308], diferencia: 3, variacionPct: 0.98 },
        { etiqueta: 'Tornu', valores: [297, 295, 299, 302], diferencia: 5, variacionPct: 1.68 },
        { etiqueta: 'Velez Sarsfield', valores: [219, 218, 219, 217], diferencia: -2, variacionPct: -0.91 },
        { etiqueta: 'Marie Curie', valores: [202, 207, 208, 205], diferencia: 3, variacionPct: 1.49 },
        { etiqueta: 'Illia', valores: [185, 184, 182, 180], diferencia: -5, variacionPct: -2.7 },
        { etiqueta: 'Udaondo', valores: [142, 144, 147, 147], diferencia: 5, variacionPct: 3.52 },
        { etiqueta: 'Rocca', valores: [122, 123, 126, 128], diferencia: 6, variacionPct: 4.92 },
        { etiqueta: 'Grierson', valores: [107, 107, 120, 119], diferencia: 12, variacionPct: 11.21 },
        { etiqueta: 'R. Psicofisica', valores: [83, 83, 83, 82], diferencia: -1, variacionPct: -1.2 },
        { etiqueta: 'Alvear', valores: [65, 69, 72, 72], diferencia: 7, variacionPct: 10.77 },
        { etiqueta: 'Tobar Garcia', valores: [73, 73, 74, 72], diferencia: -1, variacionPct: -1.37 },
        { etiqueta: 'Santa Lucia', valores: [72, 72, 72, 71], diferencia: -1, variacionPct: -1.39 },
        { etiqueta: 'Lagleyze', valores: [44, 44, 45, 46], diferencia: 2, variacionPct: 4.55 },
        { etiqueta: 'DG. Salud Mental', valores: [37, 37, 36, 41], diferencia: 4, variacionPct: 10.81 },
        { etiqueta: 'Carrillo', valores: [15, 14, 14, 13], diferencia: -2, variacionPct: -13.33 },
        { etiqueta: 'SAME', valores: [10, 10, 10, 11], diferencia: 1, variacionPct: 10.0 },
        { etiqueta: 'SS. Planificación', valores: [9, 10, 10, 10], diferencia: 1, variacionPct: 11.11 },
      ],
    },
  }
}
