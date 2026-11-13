import type { Slide12Data, FilaVariacion } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, tituloValores } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 12 ("Dotación Activa · Escalafón General").
//
// Dos bloques KPI (Dotación total ↓ / Jefes ↑) y la tabla por efector partida en
// dos columnas visuales (muchas filas), más un recuadro de aclaración.
// La tabla NO tiene columna "Dif." (sólo meses + %). Etiquetas/meses del período.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide12Data(periodo: Periodo = PERIODO_ACTUAL): Slide12Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const labelIni = etiquetaMesAnio(mesInicio(periodo), periodo)
  const labelFin = etiquetaMesAnio(mesFin(periodo), periodo)
  const valores = tituloValores(periodo)
  const chipsCompletar = chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' }))

  // Helper fila sin Dif. (diferencia null; la tabla la oculta).
  const f = (etiqueta: string, vals: number[], pct: number): FilaVariacion => ({
    etiqueta,
    valores: vals,
    diferencia: null,
    variacionPct: pct,
  })

  const comun = {
    columnaEtiqueta: 'Efector',
    tituloValores: valores,
    decimalesPct: 2,
    ocultarDif: true,
    meses,
  }

  return {
    periodo,
    tag: 'ESCALAFÓN GRAL.',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'Escalafón General',

    bloques: [
      {
        etiqueta: 'Dotación total',
        etiquetaTono: 'amarillo',
        sentido: 'baja',
        kpis: [
          { label: labelIni, value: 6410, tono: 'baseGris' },
          { label: labelFin, value: 6321, tono: 'negativo' },
          { label: 'Cantidad', value: -89, tono: 'negativo' },
          { label: 'Porcentaje', value: null, displayValue: '1,39 %', tono: 'diferencia' },
        ],
        kpisSecundarios: chipsCompletar,
      },
      {
        etiqueta: 'Jefes',
        etiquetaTono: 'rojo',
        sentido: 'sube',
        kpis: [
          { label: labelIni, value: 380, tono: 'baseGris' },
          { label: labelFin, value: 395, tono: 'destacado' },
          { label: 'Cantidad', value: 15, tono: 'diferencia' },
          { label: 'Porcentaje', value: null, displayValue: '3,95 %', tono: 'diferencia' },
        ],
        kpisSecundarios: chipsCompletar,
      },
    ],

    // ── Tabla por efector (una sola, larga: 39 filas) ──────────────────────────
    tablaEfector: {
      ...comun,
      titulo: 'Variación por Efector',
      filas: [
        f('SAME', [847, 846, 845, 844], -0.35),
        f('Santojanni', [294, 294, 293, 293], -0.34),
        f('Muñiz', [266, 263, 261, 258], -3.01),
        f('SS. Atención Primaria', [248, 244, 244, 243], -2.02),
        f('Piñero', [233, 231, 227, 227], -2.58),
        f('Ramos Mejia', [227, 226, 226, 225], -0.88),
        f('Penna', [226, 225, 224, 224], -0.88),
        f('Durand', [218, 215, 211, 212], -2.75),
        f('Argerich', [214, 212, 207, 208], -2.8),
        f('Gutierrez', [209, 207, 203, 203], -2.87),
        f('Alvarez', [201, 202, 201, 202], 0.5),
        f('Rivadavia', [182, 182, 178, 180], -1.1),
        f('Tornu', [177, 177, 176, 171], -3.39),
        f('Fernandez', [172, 171, 169, 171], -0.58),
        f('DG. Salud Mental', [164, 163, 160, 161], -1.83),
        f('Borda', [148, 149, 146, 145], -2.03),
        f('Velez Sarsfield', [138, 135, 133, 133], -3.62),
        f('Sarda', [119, 118, 117, 117], -1.68),
        f('Marie Curie', [118, 117, 117, 116], -1.69),
        f('Udaondo', [103, 101, 101, 101], -1.94),
        f('Zubizarreta', [98, 98, 98, 96], -2.04),
        f('DG. RR.FF.', [95, 94, 93, 92], -3.16),
        f('Santa Lucía', [93, 93, 91, 91], -3.19),
        f('Illia', [89, 89, 90, 90], 1.12),
        f('Rocca', [84, 84, 85, 85], 1.19),
        f('Ferrer', [76, 77, 76, 77], 1.32),
        f('Pasteur', [72, 72, 70, 71], -1.39),
        f('Dueñas', [72, 71, 69, 69], -4.17),
        f('Tobar Garcia', [63, 63, 62, 62], -1.59),
        f('DG. Atención Primaria', [63, 63, 60, 60], -4.76),
        f('R. Psicofísica', [61, 59, 60, 60], -1.64),
        f('Alvear', [43, 42, 42, 42], -2.33),
        f('DG. RR.HH.', [31, 30, 30, 30], -3.23),
        f('DG. Sistemas', [25, 26, 26, 26], 4.0),
        f('Ministerio', [22, 23, 22, 23], 4.55),
        f('Quinquela Martin', [12, 11, 11, 11], -8.33),
        f('SS. Atención Hospitalaria', [12, 12, 11, 11], -8.33),
        f('DG. Hospitales', [11, 11, 10, 10], -9.09),
        f('SS. Planificación', [9, 8, 8, 8], -11.11),
      ],
    },

    aclaracion: {
      titulo: 'Aclaración',
      lineas: ['El Escalafón General se compone', 'de los Código 83 y Código 65.'],
    },
  }
}
