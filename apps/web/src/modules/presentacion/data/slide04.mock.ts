import type { Slide04Data } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, tituloValores } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 4 ("Dotación Activa · Vista General").
//
// `buildSlide04Data(periodo)` produce los datos rotulados con el período dado:
// las etiquetas de meses, los KPIs ("Mayo '26"), los chips intermedios y el
// "Valores <año>" se DERIVAN del período. Los valores numéricos vienen de la
// slide manual del diseñador — cuando exista el endpoint, el backend devolverá
// estos mismos campos para el período solicitado y esta función se reemplaza
// por el fetch.
//
// Nota sobre meses: en la slide manual las tablas de Estado y Universo venían
// con meses Ene–Abr y la de Escalafón con May–Ago (artefacto del armado a mano).
// A futuro, UN único período de reporte gobierna toda la slide: acá las tres
// tablas usan ya los meses del período. Los valores numéricos de Estado/Universo
// quedan como en el original hasta que el backend los devuelva alineados al
// período — conviene reconciliarlos entonces.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide04Data(periodo: Periodo = PERIODO_ACTUAL): Slide04Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const valores = tituloValores(periodo)

  return {
    periodo,
    tag: 'DOTACIÓN',
    titulo: 'DOTACIÓN ACTIVA · VISTA GENERAL',
    subtitulo: 'Por Escalafón, Estado y Universo',

    kpis: [
      { label: etiquetaMesAnio(mesInicio(periodo), periodo), value: 42344, tono: 'neutro' },
      { label: etiquetaMesAnio(mesFin(periodo), periodo), value: 42390, tono: 'destacado' },
      { label: 'Diferencia', value: 46, tono: 'diferencia' },
    ],
    kpisSecundarios: chips.map((label, i) => ({ label, value: [42257, 42302][i] ?? null })),

    tablaEstado: {
      titulo: 'Variación por Estado',
      columnaEtiqueta: 'Estado',
      tituloValores: valores,
      meses,
      filas: [
        { etiqueta: 'Activo', valores: [42344, 42257, 42302, 42390], diferencia: 46, variacionPct: 0.11 },
        { etiqueta: 'Bloqueado', valores: [256, 204, 225, 209], diferencia: -47, variacionPct: -18.36 },
        { etiqueta: 'Retenido', valores: [25, 22, 23, 27], diferencia: 2, variacionPct: 8.0 },
        { etiqueta: 'Comisión', valores: [1695, 1701, 1700, 1713], diferencia: 18, variacionPct: 1.06 },
        { etiqueta: 'TOTAL', valores: [44311, 44177, 44243, 44339], diferencia: 28, variacionPct: 0.06, esTotal: true },
      ],
    },

    tablaEscalafon: {
      titulo: 'Variación por Escalafón',
      columnaEtiqueta: 'Código de Registro',
      tituloValores: valores,
      meses,
      filas: [
        { etiqueta: 'Administrativos', valores: [4756, 4727, 4682, 4678], diferencia: -78, variacionPct: -1.64 },
        { etiqueta: 'Administrativos Anexo II', valores: [1654, 1653, 1643, 1643], diferencia: -11, variacionPct: -0.67 },
        { etiqueta: 'CPH de Guardia', valores: [5938, 5965, 5958, 5965], diferencia: 27, variacionPct: 0.45 },
        { etiqueta: 'CPH de Planta', valores: [8788, 8792, 8798, 8826], diferencia: 38, variacionPct: 0.43 },
        { etiqueta: 'Cuerpo de profesionales', valores: [37, 59, 63, 62], diferencia: 25, variacionPct: 67.57 },
        { etiqueta: 'Docentes', valores: [400, 268, 353, 353], diferencia: -47, variacionPct: -11.75 },
        { etiqueta: 'Enfermería', valores: [10689, 10706, 10765, 10805], diferencia: 116, variacionPct: 1.09 },
        { etiqueta: 'Jefes CPH', valores: [2102, 2098, 2009, 2102], diferencia: 0, variacionPct: 0.0 },
        { etiqueta: 'Otros', valores: [354, 351, 347, 348], diferencia: -6, variacionPct: -1.69 },
        { etiqueta: 'Residentes', valores: [4148, 4143, 4306, 4097], diferencia: -51, variacionPct: -1.23 },
        { etiqueta: 'Técnicos de Salud', valores: [3499, 3501, 3506, 3511], diferencia: 12, variacionPct: 0.34 },
        { etiqueta: 'TOTAL', valores: [42344, 42257, 42302, 42390], diferencia: 46, variacionPct: 0.11, esTotal: true },
      ],
    },

    tablaUniverso: {
      titulo: 'Variación por Universo',
      columnaEtiqueta: 'Universo',
      columnaSubEtiqueta: 'Tipo',
      tituloValores: valores,
      meses,
      filas: [
        { etiqueta: 'SAME', subEtiqueta: 'SAME', valores: [1261, 1282, 1280, 1280], diferencia: 19, variacionPct: 1.51 },
        { etiqueta: 'NIVEL CENTRAL', subEtiqueta: 'SS Admin. de Salud', valores: [220, 223, 223, 220], diferencia: 0, variacionPct: 0.0 },
        { etiqueta: 'NIVEL CENTRAL', subEtiqueta: 'SS Atenc. Hospitalaria', valores: [689, 698, 698, 702], diferencia: 13, variacionPct: 1.89 },
        { etiqueta: 'NIVEL CENTRAL', subEtiqueta: 'SS Planif. Sanitaria', valores: [378, 385, 386, 388], diferencia: 10, variacionPct: 2.65 },
        { etiqueta: 'NIVEL CENTRAL', subEtiqueta: 'Unidad del Ministro', valores: [498, 368, 463, 457], diferencia: -41, variacionPct: -8.23 },
        { etiqueta: 'HOSPITALES', subEtiqueta: 'AGUDOS', valores: [23065, 23045, 22990, 23026], diferencia: -39, variacionPct: -0.17 },
        { etiqueta: 'HOSPITALES', subEtiqueta: 'NIÑOS', valores: [4058, 4062, 4063, 4071], diferencia: 13, variacionPct: 0.32 },
        { etiqueta: 'HOSPITALES', subEtiqueta: 'SALUD MENTAL', valores: [2586, 2591, 2606, 2601], diferencia: 15, variacionPct: 0.58 },
        { etiqueta: 'HOSPITALES', subEtiqueta: 'MONOVALENTES', valores: [7035, 7036, 7057, 7054], diferencia: 19, variacionPct: 0.27 },
        {
          etiqueta: 'APS',
          subEtiqueta: 'SS Atención Primaria / Cesacs y Áreas Programáticas',
          valores: [2574, 2558, 2573, 2591],
          diferencia: 17,
          variacionPct: 0.66,
        },
        { etiqueta: 'TOTAL', valores: [42343, 42256, 42302, 42390], diferencia: 26, variacionPct: 0.11, esTotal: true },
      ],
    },

    tarjetas: [
      { etiqueta: 'APS', value: 2591, participacionPct: 6.1, tono: 'oscuro' },
      { etiqueta: 'NIVEL CENTRAL', value: 1767, participacionPct: 4.2, tono: 'oscuro' },
      { etiqueta: 'SAME', value: 1280, participacionPct: 3.0, tono: 'claro' },
      { etiqueta: 'HOSPITALES', value: 36752, participacionPct: 86.7, tono: 'claro' },
    ],

    ctaFooter: 'COMPARATIVA 1° / 2° CUATRIM',
  }
}
