import type { Slide07Data, ColumnaDef, FilaColumnas } from './types'
import type { Periodo, Mes } from './periodo'
import { etiquetaMesAnio, mesInicio, mesFin, mesesIntermedios, nombreMes } from './periodo'
import { PERIODO_ACTUAL } from './periodoActual'

// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo de la Slide 7 ("Dotación Activa · CPH de Guardia · Por
// Efector y Tipo").
//
// Las tablas tienen, POR CADA MES del período, dos subcolumnas: Cargos y
// Activos. El dato siempre está completo (todas las columnas), pero por diseño
// se OCULTAN las columnas "Cargos" de los meses intermedios: el fuerte de la
// slide es comparar el primer mes del cuatrimestre contra el último, así que
// Cargos sólo se muestra en el primer y último mes; Activos en todos.
//
// Ocultar/mostrar es sólo un flag (col.oculta) — el backend puede traer todo y
// la visualización decide. Cambiar qué se oculta no toca los datos.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera las columnas de la tabla: Efector, Tipo, luego (Cargos, Activos) por
 * cada mes del período, y % Var. Cuatrim. Las columnas "Cargos" de meses
 * intermedios nacen ocultas (ver nota arriba).
 */
function columnasEfectorTipo(periodo: Periodo): ColumnaDef[] {
  const primero = mesInicio(periodo)
  const ultimo = mesFin(periodo)
  const intermedios = new Set<Mes>(mesesIntermedios(periodo))

  const cols: ColumnaDef[] = [
    { clave: 'efector', header: 'Efector', grupo: '', formato: 'texto' },
    { clave: 'tipo', header: 'Tipo', grupo: '', formato: 'texto' },
  ]

  for (const m of periodo.meses) {
    const grupo = nombreMes(m)
    const esIntermedio = intermedios.has(m)
    cols.push({
      clave: `cargos_${m}`,
      header: 'Cargos',
      grupo,
      formato: 'numero',
      // Cargos sólo visible en primer y último mes; oculto en intermedios.
      oculta: esIntermedio,
    })
    cols.push({ clave: `activos_${m}`, header: 'Activos', grupo, formato: 'numero' })
  }

  cols.push({ clave: 'variacionPct', header: '% Var. Cuatrim', grupo: '', formato: 'porcentaje' })
  // Marca de uso para evitar warning de variables sin leer (primero/ultimo se
  // usan conceptualmente arriba al no ocultar sus Cargos).
  void primero
  void ultimo
  return cols
}

/** Construye una fila a partir de valores crudos (orden de meses del período). */
function fila(
  periodo: Periodo,
  efector: string,
  tipo: string,
  cargos: number[],
  activos: number[],
  variacionPct: number
): FilaColumnas {
  const f: FilaColumnas = { efector, tipo, variacionPct }
  periodo.meses.forEach((m, i) => {
    f[`cargos_${m}`] = cargos[i] ?? null
    f[`activos_${m}`] = activos[i] ?? null
  })
  return f
}

export function buildSlide07Data(periodo: Periodo = PERIODO_ACTUAL): Slide07Data {
  const columnas = columnasEfectorTipo(periodo)
  const chips = mesesIntermedios(periodo).map((m) => nombreMes(m))

  return {
    periodo,
    tag: 'GUARDIA',
    titulo: 'DOTACIÓN ACTIVA',
    subtitulo: 'CPH de Guardia',
    subtitulo2: 'Jefes incluidos',
    rotulo: 'Por Efector y Tipo',

    kpis: [
      { label: 'Cargos', value: 6646, tono: 'base' },
      { label: etiquetaMesAnio(mesInicio(periodo), periodo), value: 5573, tono: 'neutro' },
      { label: etiquetaMesAnio(mesFin(periodo), periodo), value: 5627, tono: 'destacado' },
      { label: 'Cantidad', value: 54, tono: 'diferencia' },
      { label: 'Porcentaje', value: null, displayValue: '0,9 %', tono: 'diferencia' },
    ],
    kpisSecundarios: chips.map((label) => ({ label, value: null, displayValue: 'COMPLETAR' })),

    // ── Variación por Crecimiento ──────────────────────────────────────────────
    // fila(periodo, efector, tipo, cargos[Ene,Feb,Mar,Abr], activos[...], %)
    tablaCrecimiento: {
      titulo: 'Variación por Crecimiento',
      subtitulo: 'Variación por crecimiento',
      columnas,
      filas: [
        fila(periodo, 'Inst. Transplante', 'Monovalente', [14, 7, 7, 14], [7, 7, 7, 8], 14.29),
        fila(periodo, 'Rocca', 'Monovalente', [42, 37, 37, 41], [37, 37, 37, 40], 8.11),
        fila(periodo, 'Borda', 'Salud Mental', [128, 76, 79, 128], [76, 79, 81, 82], 7.89),
        fila(periodo, 'R. Psicofísica', 'Monovalente', [30, 26, 28, 30], [26, 26, 28, 28], 7.69),
        fila(periodo, 'Lagleyze', 'Monovalente', [31, 26, 26, 30], [26, 26, 26, 27], 3.85),
        fila(periodo, 'Carrillo', 'Monovalente', [33, 29, 30, 32], [29, 29, 30, 30], 3.45),
        fila(periodo, 'Pirovano', 'Monovalente', [85, 76, 76, 83], [76, 76, 76, 78], 2.63),
        fila(periodo, 'Velez Sarsfield', 'Agudos', [47, 44, 46, 47], [44, 44, 45, 45], 2.27),
        fila(periodo, 'Gutiérrez', 'Niños', [87, 81, 82, 87], [81, 81, 81, 82], 1.23),
      ],
    },

    // ── Variación por Decrecimiento ────────────────────────────────────────────
    tablaDecrecimiento: {
      titulo: 'Variación por Decrecimiento',
      subtitulo: 'Variación por decrecimiento',
      columnas,
      filas: [
        fila(periodo, 'Muñiz', 'Monovalente', [77, 71, 69, 77], [70, 71, 69, 69], -1.43),
        fila(periodo, 'Tornu', 'Agudos', [60, 56, 56, 59], [55, 56, 54, 54], -1.82),
        fila(periodo, 'Moyano', 'Salud Mental', [109, 103, 104, 109], [104, 103, 104, 102], -1.92),
        fila(periodo, 'Illia', 'Monovalente', [33, 33, 33, 31], [32, 33, 33, 31], -3.13),
        fila(periodo, 'Argerich', 'Agudos', [100, 89, 88, 100], [91, 89, 88, 88], -3.3),
        fila(periodo, 'Penna', 'Agudos', [60, 55, 54, 60], [56, 55, 54, 54], -3.57),
        fila(periodo, 'Alvarez', 'Agudos', [70, 65, 65, 69], [68, 65, 65, 65], -4.41),
        fila(periodo, 'Ferrer', 'Monovalente', [33, 31, 30, 33], [32, 31, 30, 30], -6.25),
        fila(periodo, 'Alvear', 'Salud Mental', [15, 14, 13, 15], [14, 14, 13, 13], -7.14),
        fila(periodo, 'Dueñas', 'Monovalente', [27, 20, 19, 24], [20, 20, 19, 18], -10.0),
      ],
    },
  }
}
