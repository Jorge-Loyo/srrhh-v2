import type { Slide11Data } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, tituloValores } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 11 ("Dotación Activa · Técnicos de la Salud").
//
// Dos bloques de KPIs (Dotación total ↑ / Jefes ↓), gráfico de barras simples
// con línea de tendencia (activos por mes) y tabla de variación por efector.
// Etiquetas/meses derivados del período.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide11Data(periodo: Periodo = PERIODO_ACTUAL): Slide11Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const labelIni = etiquetaMesAnio(mesInicio(periodo), periodo)
  const labelFin = etiquetaMesAnio(mesFin(periodo), periodo)
  const valores = tituloValores(periodo)
  const chipsCompletar = chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' }))

  // Activos por mes (gráfico). Orden = meses del período.
  const activos = [3240, 3240, 3250, 3251]
  const coloresBarras = ['#5BBFBF', '#F5BF00', '#1A2B4A', '#C0564B']

  return {
    periodo,
    tag: 'TÉCNICOS',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'Técnicos de la Salud',

    bloques: [
      {
        etiqueta: 'Dotación total',
        etiquetaTono: 'amarillo',
        sentido: 'sube',
        kpis: [
          { label: labelIni, value: 3240, tono: 'neutro' },
          { label: labelFin, value: 3521, tono: 'destacado' },
          { label: 'Cantidad', value: 11, tono: 'diferencia' },
          { label: 'Porcentaje', value: null, displayValue: '0,34 %', tono: 'diferencia' },
        ],
        kpisSecundarios: chipsCompletar,
      },
      {
        etiqueta: 'Jefes',
        etiquetaTono: 'rojo',
        sentido: 'baja',
        kpis: [
          { label: labelIni, value: 261, tono: 'baseGris' },
          { label: labelFin, value: 256, tono: 'negativo' },
          { label: 'Cantidad', value: -5, tono: 'negativo' },
          { label: 'Porcentaje', value: null, displayValue: '-1,92 %', tono: 'diferencia' },
        ],
        kpisSecundarios: chipsCompletar,
      },
    ],

    // ── Gráfico: evolución de activos (barras simples + línea de tendencia) ─────
    tituloGrafico: 'Por Período',
    subtituloGrafico: 'Evolución de activos',
    grafico: {
      barras: meses.map((etiqueta, i) => ({
        etiqueta: `${etiqueta} ${periodo.anio}`,
        valor: activos[i] ?? null,
        color: coloresBarras[i % coloresBarras.length],
      })),
      lineaTendencia: true,
      minY: 3100,
      maxY: 3260,
      pasoY: 20,
    },

    // ── Tabla: variación por efector ───────────────────────────────────────────
    tablaEfector: {
      titulo: 'Variación por Efector',
      subtitulo: '% Variación cuatrimestral por efector',
      columnaEtiqueta: 'Efector',
      tituloValores: valores,
      decimalesPct: 2,
      meses,
      notaPie: '*Los efectores y especialidades mencionadas son los únicos que POSEEN VARIACIÓN',
      filas: [
        { etiqueta: 'SS Atención Primaria', valores: [93, 94, 98, 104], diferencia: 11, variacionPct: 11.83 },
        { etiqueta: 'Moyano', valores: [25, 25, 25, 27], diferencia: 2, variacionPct: 8.0 },
        { etiqueta: 'Quinquela Martín', valores: [29, 30, 30, 30], diferencia: 1, variacionPct: 3.45 },
        { etiqueta: 'Ferrer', valores: [33, 33, 33, 34], diferencia: 1, variacionPct: 3.03 },
        { etiqueta: 'Durand', valores: [170, 172, 175, 175], diferencia: 5, variacionPct: 2.94 },
        { etiqueta: 'Elizalde', valores: [145, 146, 148, 148], diferencia: 3, variacionPct: 2.07 },
        { etiqueta: 'Muñiz', valores: [112, 112, 114, 114], diferencia: 2, variacionPct: 1.79 },
        { etiqueta: 'Zubizarreta', valores: [80, 80, 81, 81], diferencia: 1, variacionPct: 1.25 },
        { etiqueta: 'Sarda', valores: [82, 82, 83, 83], diferencia: 1, variacionPct: 1.22 },
        { etiqueta: 'Illia', valores: [83, 84, 83, 84], diferencia: 1, variacionPct: 1.2 },
        { etiqueta: 'Velez Sársfield', valores: [83, 83, 83, 84], diferencia: 1, variacionPct: 1.2 },
        { etiqueta: 'Dueñas', valores: [99, 99, 100, 100], diferencia: 1, variacionPct: 1.01 },
        { etiqueta: 'Gutiérrez', valores: [207, 208, 207, 206], diferencia: -1, variacionPct: -0.48 },
        { etiqueta: 'Pirovano', valores: [149, 147, 148, 148], diferencia: -1, variacionPct: -0.67 },
        { etiqueta: 'Tornu', valores: [113, 113, 111, 112], diferencia: -1, variacionPct: -0.88 },
        { etiqueta: 'Santojanni', valores: [195, 194, 192, 193], diferencia: -2, variacionPct: -1.03 },
        { etiqueta: 'Argerich', valores: [220, 221, 218, 217], diferencia: -3, variacionPct: -1.36 },
        { etiqueta: 'Penna', valores: [167, 167, 166, 164], diferencia: -3, variacionPct: -1.8 },
        { etiqueta: 'Rivadavia', valores: [154, 153, 153, 151], diferencia: -3, variacionPct: -1.95 },
        { etiqueta: 'Udaondo', valores: [86, 86, 85, 84], diferencia: -2, variacionPct: -2.33 },
        { etiqueta: 'Rocca', valores: [42, 42, 42, 41], diferencia: -1, variacionPct: -2.38 },
        { etiqueta: 'Pasteur', valores: [17, 17, 17, 16], diferencia: -1, variacionPct: -5.88 },
      ],
    },
  }
}
