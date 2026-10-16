import type { Slide05Data } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 5 ("Dotación Activa · CPH de Planta").
//
// `buildSlide05Data(periodo)` produce los datos rotulados con el período dado:
// las etiquetas de meses, los KPIs ("Mayo '26") y los chips intermedios se
// DERIVAN del período, no están hardcodeados. Los valores numéricos vienen de
// la slide manual del diseñador (May–Ago 2026) — cuando exista el endpoint, el
// backend devolverá estos mismos campos para el período solicitado y esta
// función se reemplaza por el fetch.
//
// Nota: los meses intermedios de la captura son poco legibles en varias filas;
// conviene confirmar esos valores contra el dato real.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide05Data(periodo: Periodo = PERIODO_ACTUAL): Slide05Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))

  return {
    periodo,
    tag: 'PLANTA',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'CPH de Planta',

    kpis: [
      { label: etiquetaMesAnio(mesInicio(periodo), periodo), value: 8845, tono: 'neutro' },
      { label: etiquetaMesAnio(mesFin(periodo), periodo), value: 8976, tono: 'destacado' },
      { label: 'Diferencia', value: 131, tono: 'diferencia' },
      { label: 'Porcentaje', value: null, displayValue: '1,48 %', tono: 'diferencia' },
    ],
    kpisSecundarios: chips.map((label, i) => ({ label, value: [8867, 8942][i] ?? null })),

    tablaEfector: {
      titulo: 'Variación por Efector',
      subtitulo: '% Variación trim. efector en planta',
      columnaEtiqueta: 'Efector',
      decimalesPct: 0,
      meses,
      filas: [
        { etiqueta: 'Quinquela Martín', valores: [28, 27, 35, 35], diferencia: 7, variacionPct: 25 },
        { etiqueta: 'Santa Lucía', valores: [67, 68, 71, 75], diferencia: 8, variacionPct: 12 },
        { etiqueta: 'Carrillo', valores: [62, 61, 66, 68], diferencia: 6, variacionPct: 10 },
        { etiqueta: 'Grierson', valores: [103, 104, 108, 109], diferencia: 6, variacionPct: 6 },
        { etiqueta: 'Muñiz', valores: [208, 210, 216, 219], diferencia: 11, variacionPct: 5 },
        { etiqueta: 'Udaondo', valores: [96, 95, 99, 101], diferencia: 5, variacionPct: 5 },
        { etiqueta: 'Rocca', valores: [101, 101, 105, 105], diferencia: 4, variacionPct: 4 },
        { etiqueta: 'Moyano', valores: [122, 122, 125, 125], diferencia: 3, variacionPct: 2 },
        { etiqueta: 'Sarda', valores: [134, 135, 134, 137], diferencia: 3, variacionPct: 2 },
        { etiqueta: 'Durand', valores: [426, 428, 436, 435], diferencia: 9, variacionPct: 2 },
        { etiqueta: 'Alvarez', valores: [289, 292, 294, 295], diferencia: 6, variacionPct: 2 },
        { etiqueta: 'Penna', valores: [264, 267, 269, 269], diferencia: 5, variacionPct: 2 },
        { etiqueta: 'Rivadavia', valores: [333, 334, 336, 339], diferencia: 6, variacionPct: 2 },
        { etiqueta: 'Borda', valores: [129, 128, 131, 131], diferencia: 2, variacionPct: 2 },
        { etiqueta: 'Elizalde', valores: [343, 347, 347, 348], diferencia: 5, variacionPct: 1 },
      ],
    },

    tablaEspecialidad: {
      titulo: 'Variación por Especialidad',
      subtitulo: 'Variación por especialidad',
      columnaEtiqueta: 'Efector',
      decimalesPct: 0,
      meses,
      notaPie: '*Los efectores y especialidades mencionadas son los únicos que POSEEN VARIACIÓN',
      filas: [
        { etiqueta: 'Psiquiatría Infanto Juvenil', valores: [14, 15, 17, 19], diferencia: 5, variacionPct: 36 },
        { etiqueta: 'Oftalmología', valores: [140, 143, 151, 160], diferencia: 20, variacionPct: 14 },
        { etiqueta: 'Odontología general', valores: [416, 413, 416, 457], diferencia: 41, variacionPct: 10 },
        { etiqueta: 'Diagnóstico por imágenes', valores: [173, 174, 182, 187], diferencia: 14, variacionPct: 8 },
        { etiqueta: 'Neumonología', valores: [74, 75, 76, 78], diferencia: 4, variacionPct: 5 },
        { etiqueta: 'Psicopedagogía', valores: [128, 129, 134, 133], diferencia: 5, variacionPct: 4 },
        { etiqueta: 'Cardiología', valores: [303, 304, 303, 311], diferencia: 8, variacionPct: 3 },
        { etiqueta: 'Fonoaudiología', valores: [228, 232, 231, 233], diferencia: 5, variacionPct: 2 },
        { etiqueta: 'Bioquímica clínica', valores: [134, 135, 136, 137], diferencia: 3, variacionPct: 2 },
        { etiqueta: 'Terapia ocupacional', valores: [130, 131, 132, 133], diferencia: 3, variacionPct: 2 },
        { etiqueta: 'Anatomía patológica', valores: [95, 95, 97, 97], diferencia: 2, variacionPct: 2 },
        { etiqueta: 'Pediatría (Clínica pediátrica)', valores: [779, 784, 798, 790], diferencia: 11, variacionPct: 1 },
        { etiqueta: 'Farmacia hospitalaria', valores: [269, 268, 269, 272], diferencia: 3, variacionPct: 1 },
        { etiqueta: 'Tocoginecología', valores: [305, 306, 308, 308], diferencia: 3, variacionPct: 1 },
        { etiqueta: 'Cirugía general', valores: [190, 190, 191, 192], diferencia: 2, variacionPct: 1 },
      ],
    },
  }
}
