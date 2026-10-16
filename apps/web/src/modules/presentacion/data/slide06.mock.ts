import type { Slide06Data } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, tituloValores } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 6 ("Dotación Activa · CPH de Guardia · Jefes
// incluidos").
//
// `buildSlide06Data(periodo)` deriva del período las etiquetas de meses, los
// KPIs y los chips. Igual que S4/S5, cuando exista el endpoint el backend
// devolverá estos campos para el período solicitado.
//
// KPIs incompletos: en la slide manual los KPIs todavía no estaban cargados
// ("NUM" / "COMPLETAR"). Se representan con value:null + displayValue de
// placeholder — el día que el backend traiga los números, se quitan los
// placeholders y entran los valores reales sin tocar el componente.
//
// Las dos tablas tienen una columna fija "Cargos" previa a los meses
// (columnaValorPrevio) y % con 2 decimales (ej: "-0,63 %").
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide06Data(periodo: Periodo = PERIODO_ACTUAL): Slide06Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const valores = tituloValores(periodo)

  return {
    periodo,
    tag: 'GUARDIA',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'CPH de Guardia',
    subtitulo2: 'Jefes incluidos',

    kpis: [
      // Caja oscura "Cargos" — total de cargos (aún sin cargar en la slide manual).
      { label: 'Cargos', value: null, displayValue: 'NUM', tono: 'base' },
      { label: etiquetaMesAnio(mesInicio(periodo), periodo), value: null, displayValue: 'NUM', tono: 'neutro' },
      { label: etiquetaMesAnio(mesFin(periodo), periodo), value: null, displayValue: 'NUM', tono: 'destacado' },
      { label: 'Cantidad', value: null, displayValue: 'NUM', tono: 'diferencia' },
      { label: 'Porcentaje', value: null, displayValue: 'NUM', tono: 'diferencia' },
    ],
    kpisSecundarios: chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' })),

    // ── Variación por Crecimiento ──────────────────────────────────────────────
    tablaCrecimiento: {
      titulo: 'Variación por Crecimiento',
      subtitulo: 'Variación por crecimiento',
      columnaEtiqueta: 'Especialidad',
      columnaValorPrevio: 'Cargos',
      tituloValores: valores,
      meses,
      filas: [
        { etiqueta: 'Terapia intensiva', valorPrevio: 561, valores: [496, 500, 502, 504], diferencia: 8, variacionPct: 1.61 },
        { etiqueta: 'Pediatría', valorPrevio: 462, valores: [424, 426, 429, 429], diferencia: 5, variacionPct: 1.18 },
        { etiqueta: 'Obstetricia', valorPrevio: 218, valores: [206, 206, 210, 209], diferencia: 3, variacionPct: 1.46 },
        { etiqueta: 'Clínica Médica', valorPrevio: 279, valores: [191, 195, 198, 198], diferencia: 7, variacionPct: 3.66 },
        { etiqueta: 'Cirugía general', valorPrevio: 217, valores: [195, 198, 198, 198], diferencia: 3, variacionPct: 1.54 },
        { etiqueta: 'Ortopedia y traumatología', valorPrevio: 205, valores: [181, 187, 187, 187], diferencia: 6, variacionPct: 3.31 },
        { etiqueta: 'Radiodiagnóstico | Dxl', valorPrevio: 192, valores: [172, 174, 176, 175], diferencia: 3, variacionPct: 1.74 },
        { etiqueta: 'Cardiología', valorPrevio: 196, valores: [172, 171, 173, 173], diferencia: 1, variacionPct: 0.58 },
        { etiqueta: 'Nefrología', valorPrevio: 45, valores: [43, 44, 44, 44], diferencia: 1, variacionPct: 2.33 },
        { etiqueta: 'Toxicología', valorPrevio: 49, valores: [34, 39, 39, 39], diferencia: 5, variacionPct: 14.71 },
        { etiqueta: 'Endoscopia', valorPrevio: 35, valores: [27, 31, 31, 31], diferencia: 4, variacionPct: 14.81 },
        { etiqueta: 'Cirugía Plástica Reparad.', valorPrevio: 21, valores: [18, 20, 20, 20], diferencia: 2, variacionPct: 11.11 },
        { etiqueta: 'Tocoginecología', valorPrevio: 6, valores: [6, 6, 6, 6], diferencia: 0, variacionPct: 0.0 },
      ],
    },

    // ── Variación por Decrecimiento ────────────────────────────────────────────
    tablaDecrecimiento: {
      titulo: 'Variación por Decrecimiento',
      subtitulo: 'Variación por decrecimiento',
      columnaEtiqueta: 'Especialidad',
      columnaValorPrevio: 'Cargos',
      tituloValores: valores,
      meses,
      filas: [
        { etiqueta: 'Sin especialidad', valorPrevio: 917, valores: [791, 788, 787, 786], diferencia: -5, variacionPct: -0.63 },
        { etiqueta: 'Kinesiología', valorPrevio: 477, valores: [465, 461, 461, 462], diferencia: -3, variacionPct: -0.65 },
        { etiqueta: 'Bioquímico/a', valorPrevio: 324, valores: [317, 315, 312, 311], diferencia: -6, variacionPct: -1.89 },
        { etiqueta: 'Psiquiatría', valorPrevio: 279, valores: [236, 236, 235, 234], diferencia: -2, variacionPct: -1.69 },
        { etiqueta: 'Farmacéutico/a', valorPrevio: 245, valores: [238, 235, 235, 234], diferencia: -4, variacionPct: -1.68 },
        { etiqueta: 'Neonatología', valorPrevio: 225, valores: [211, 206, 206, 206], diferencia: -5, variacionPct: -2.37 },
        { etiqueta: 'Obstetrica', valorPrevio: 201, valores: [193, 190, 189, 189], diferencia: -4, variacionPct: -2.07 },
        { etiqueta: 'Anestesiología', valorPrevio: 276, valores: [176, 167, 168, 165], diferencia: -11, variacionPct: -2.13 },
        { etiqueta: 'Psicólogo/a', valorPrevio: 161, valores: [152, 151, 150, 150], diferencia: -2, variacionPct: -1.32 },
        { etiqueta: 'Trabajador/a social', valorPrevio: 154, valores: [149, 148, 148, 148], diferencia: -1, variacionPct: -0.67 },
        { etiqueta: 'Oftalmología', valorPrevio: 112, valores: [104, 102, 103, 103], diferencia: -1, variacionPct: -0.96 },
        { etiqueta: 'Neurocirugía', valorPrevio: 77, valores: [64, 62, 60, 59], diferencia: -5, variacionPct: -7.81 },
        { etiqueta: 'Odontólogo/a', valorPrevio: 49, valores: [47, 46, 46, 46], diferencia: -1, variacionPct: -2.13 },
        { etiqueta: 'Gastroenterología', valorPrevio: 28, valores: [27, 25, 24, 24], diferencia: -3, variacionPct: -11.11 },
        { etiqueta: 'Neumotisiología', valorPrevio: 14, valores: [12, 12, 12, 11], diferencia: -1, variacionPct: -8.33 },
        { etiqueta: 'Neurología', valorPrevio: 14, valores: [12, 12, 11, 11], diferencia: -1, variacionPct: -8.33 },
        { etiqueta: 'Otorrinolaringología', valorPrevio: 13, valores: [7, 6, 6, 6], diferencia: -1, variacionPct: -14.29 },
        { etiqueta: 'Urología', valorPrevio: 7, valores: [7, 7, 6, 6], diferencia: -1, variacionPct: -14.29 },
      ],
    },
  }
}
