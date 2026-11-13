import type { Slide13Data, FilaVariacion } from './types'
import type { Periodo } from './periodo'
import { nombresMeses, etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes, tituloValores } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 13 ("Dotación Activa · Residentes").
//
// Un bloque KPI (baja: 4.184 → 4.121), gráfico de torta con la composición por
// tipo de residencia y tabla de variación por efector (sin columna Dif.).
// ─────────────────────────────────────────────────────────────────────────────

export function buildSlide13Data(periodo: Periodo = PERIODO_ACTUAL): Slide13Data {
  const meses = nombresMeses(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))
  const labelIni = etiquetaMesAnio(mesInicio(periodo), periodo)
  const labelFin = etiquetaMesAnio(mesFin(periodo), periodo)
  const valores = tituloValores(periodo)

  const f = (etiqueta: string, vals: number[], pct: number): FilaVariacion => ({
    etiqueta,
    valores: vals,
    diferencia: null,
    variacionPct: pct,
  })

  return {
    periodo,
    tag: 'RESIDENTES',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'Residentes',

    bloque: {
      sentido: 'baja',
      kpis: [
        { label: labelIni, value: 4184, tono: 'baseGris' },
        { label: labelFin, value: 4121, tono: 'negativo' },
        { label: 'Cantidad', value: -63, tono: 'negativo' },
        { label: 'Porcentaje', value: null, displayValue: '-1,51 %', tono: 'diferencia' },
      ],
      kpisSecundarios: chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' })),
    },

    // ── Composición por tipo de residencia (torta) ─────────────────────────────
    torta: {
      valoresSonPorcentaje: true,
      segmentos: [
        { etiqueta: 'Residencia Médica', valor: 81.4, color: '#1A2B4A' },
        { etiqueta: 'Residencia Profesionales de Salud', valor: 12.2, color: '#F5BF00' },
        { etiqueta: 'Residencia Enfermería', valor: 2.52, color: '#C0564B' },
        { etiqueta: 'Residencia Interdisciplinaria', valor: 2.33, color: '#ADB5BD' },
        { etiqueta: 'Residencia de Apoyo a la Salud', valor: 1.6, color: '#5BBFBF' },
      ],
    },

    // ── Tabla por efector (sin columna Dif.) ───────────────────────────────────
    tablaEfector: {
      titulo: 'Variación por Efector',
      subtitulo: '% Variación cuatrimestral por efector',
      columnaEtiqueta: 'Efector',
      tituloValores: valores,
      decimalesPct: 2,
      ocultarDif: true,
      meses,
      notaPie: '*Los efectores y especialidades mencionadas son los únicos que POSEEN VARIACIÓN',
      filas: [
        f('Argerich', [375, 374, 370, 370], -1.33),
        f('Fernández', [354, 353, 350, 349], -1.41),
        f('Durand', [280, 279, 276, 277], -1.07),
        f('Elizalde', [260, 259, 257, 254], -2.31),
        f('Pirovano', [209, 209, 206, 206], -1.44),
        f('Alvarez', [198, 198, 197, 195], -1.52),
        f('Penna', [186, 185, 183, 183], -1.61),
        f('Piñero', [187, 185, 180, 180], -3.74),
        f('Rivadavia', [164, 165, 163, 162], -1.22),
        f('Velez Sársfield', [80, 80, 79, 79], -1.25),
        f('Tobar García', [54, 53, 53, 53], -1.85),
        f('Alvear', [49, 49, 49, 48], -2.04),
        f('Borda', [48, 47, 47, 47], -2.08),
        f('Sarda', [46, 46, 42, 43], -6.52),
        f('Udaondo', [34, 33, 33, 33], -2.94),
        f('R. Psicofísica', [28, 27, 27, 27], -3.57),
        f('Marie Curie', [15, 15, 15, 14], -6.67),
        f('Carrillo', [12, 12, 12, 11], -8.33),
      ],
    },
  }
}
