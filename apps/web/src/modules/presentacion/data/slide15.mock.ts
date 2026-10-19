import type { Slide15Data, ColumnaDef, FilaColumnas } from './types'
import type { Periodo } from './periodo'
import { etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 15 ("Comparativa de Cuatrimestres").
//
// Slide especial: compara el 1° vs el 2° cuatrimestre. Varios KPIs están aún sin
// cargar en la slide manual (placeholder "NUM"); se representan con value:null +
// displayValue, como en otras slides, listos para que el backend los complete.
//
// El gráfico de barras agrupadas (2 series) y la tabla comparativa comparten las
// mismas categorías/valores de % de variación por escalafón.
// ─────────────────────────────────────────────────────────────────────────────

const ESCALAFONES = [
  'Administrativos',
  'Administrativos Anexo II',
  'CPH de Guardia',
  'CPH de Planta',
  'Cuerpo de profesionales',
  'Docentes',
  'Enfermería',
  'Jefes CPH',
  'Otros',
  'Residentes',
  'Técnicos de Salud',
]

// % de variación por escalafón: [1° cuatrimestre, 2° cuatrimestre] (de la slide).
const VAR_POR_ESCALAFON: [number, number][] = [
  [15, 35],
  [33, 9],
  [30, 9],
  [70, 33],
  [55, 16],
  [63, 9],
  [44, 60],
  [9, 45],
  [6, 7],
  [31, 64],
  [44, 66],
]

export function buildSlide15Data(periodo: Periodo = PERIODO_ACTUAL): Slide15Data {
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))

  // ── Tabla comparativa (TablaColumnas genérica) ─────────────────────────────
  const columnas: ColumnaDef[] = [
    { clave: 'escalafon', header: 'Código de Registro', formato: 'texto' },
    { clave: 'var1', header: '% Var. 1° Cuatrim', grupo: 'Comparativo 2026', formato: 'porcentaje', decimalesPct: 0 },
    { clave: 'var2', header: '% Var. 2° Cuatrim', grupo: 'Comparativo 2026', formato: 'porcentaje', decimalesPct: 0 },
    { clave: 'difAnual', header: 'Dif. % Var. Anual', formato: 'porcentaje', decimalesPct: 0 },
  ]

  const filas: FilaColumnas[] = ESCALAFONES.map((esc, i) => {
    const [v1, v2] = VAR_POR_ESCALAFON[i]
    return { escalafon: esc, var1: v1, var2: v2, difAnual: v2 - v1 }
  })
  // Fila TOTAL (promedios simples, sólo ilustrativo del mock).
  const prom = (idx: 0 | 1) => Math.round(VAR_POR_ESCALAFON.reduce((s, v) => s + v[idx], 0) / VAR_POR_ESCALAFON.length)
  filas.push({ escalafon: 'TOTAL', var1: prom(0), var2: prom(1), difAnual: prom(1) - prom(0), esTotal: true })

  return {
    periodo,
    tag: 'COMPARATIVA',
    titulo: 'DOTACIÓN ACTIVA · VISTA GENERAL',
    subtitulo: 'Comparativa de Cuatrimestres',

    chipContexto: { valor: 'XX', label: 'Total al cierre del 1° cuatrimestre' },
    resumenDestacado: { label: 'Diferencia e/cuatrim', value: null, displayValue: 'NUM', tono: 'negativo' },

    kpis: [
      { label: etiquetaMesAnio(mesInicio(periodo), periodo), value: null, displayValue: 'NUM', tono: 'neutro' },
      { label: etiquetaMesAnio(mesFin(periodo), periodo), value: null, displayValue: 'NUM', tono: 'destacado' },
      { label: 'Diferencia', value: null, displayValue: 'NUM', tono: 'diferencia' },
      { label: 'Porcentaje', value: null, displayValue: 'NUM', tono: 'diferencia' },
    ],
    kpisSecundarios: chips.map((label) => ({ label, value: null, displayValue: 'NUM' })),

    tablaComparativa: {
      titulo: 'Variación por Escalafón',
      columnas,
      filas,
    },

    // ── Gráfico de barras agrupadas: 1° vs 2° cuatrimestre por escalafón ───────
    grafico: {
      orientacion: 'vertical',
      categorias: ESCALAFONES,
      series: [
        { nombre: '1° Cuatrimestre', color: '#1A2B4A' },
        { nombre: '2° Cuatrimestre', color: '#C0564B' },
      ],
      valores: VAR_POR_ESCALAFON.map(([v1, v2]) => [v1, v2]),
      minY: 0,
      maxY: 80,
      pasoY: 20,
    },
  }
}
