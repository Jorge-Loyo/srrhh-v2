import * as XLSX from 'xlsx'
// xlsx-js-style es un fork drop-in de SheetJS que SÍ escribe estilos de celda
// (fondo, negrita, bordes); la build community de `xlsx` los ignora al escribir.
// Se usa solo para el export con encabezados coloreados (downloadExcelConGrupos);
// la API es idéntica a `xlsx`, por eso comparte el mismo tipo XLSX.Range.
import * as XLSXStyle from 'xlsx-js-style'
import type { PaginatedResponse } from '@srrhh/types'

// S3-10: exporta TODO el resultado filtrado (no solo la página visible en
// pantalla) — se pagina en lotes grandes contra el mismo endpoint que ya usa
// la tabla, hasta juntar todas las filas. Con 45k-46k registros (volumen
// real del sistema, ver Sprint 2) esto son ~45-50 requests de 1000 filas
// cada una; a los 8-30ms medidos por Jorge contra la BD real, el fetch en sí
// tarda unos segundos, no minutos.
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  while (true) {
    const res = await fetchPage(page, pageSize)
    all.push(...res.data)
    if (all.length >= res.meta.total || res.data.length === 0) break
    page++
  }
  return all
}

// `rows` ya vienen mapeadas a objetos planos con las claves = encabezados de
// columna que se quieren en el Excel (en el orden en que se insertaron).
export function downloadExcel(filename: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Datos')
  XLSX.writeFile(book, filename)
}

// Export con DOS niveles de encabezado en una sola hoja (usado hoy solo por
// /cargos — NO toca `downloadExcel`, que usan el resto de los exports):
//   Fila 1 = grupos con celdas combinadas (un título por span de columnas)
//   Fila 2 = nombres de columna
//   Fila 3+ = datos (una fila por registro, en el orden de `columnas`)
// `grupos` describe los bloques de la fila 1: cada `span` es la cantidad de
// columnas que abarca; la suma de spans debe igualar `columnas.length`.
export function downloadExcelConGrupos(
  filename: string,
  grupos: { titulo: string; span: number }[],
  columnas: string[],
  rows: (string | number)[][]
) {
  // Fila de grupos: el título va en la 1ª celda de cada span, el resto vacío
  // (las celdas combinadas toman el valor de la superior-izquierda).
  const filaGrupos: string[] = []
  const merges: XLSX.Range[] = []
  let col = 0
  for (const g of grupos) {
    filaGrupos.push(g.titulo)
    for (let i = 1; i < g.span; i++) filaGrupos.push('')
    if (g.span > 1) {
      merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + g.span - 1 } })
    }
    col += g.span
  }

  const sheet = XLSX.utils.aoa_to_sheet([filaGrupos, columnas, ...rows])
  sheet['!merges'] = merges

  // Estilo de los DOS encabezados (fila 1 = grupos, fila 2 = columnas): fondo
  // amarillo + negrita + centrado + bordes, para que el Excel salga ya
  // formateado y no haya que pintarlo a mano en cada descarga.
  const estiloEncabezado = {
    fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } }, // amarillo suave
    font: { bold: true, sz: 11, color: { rgb: '000000' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'BFBFBF' } },
      bottom: { style: 'thin', color: { rgb: 'BFBFBF' } },
      left: { style: 'thin', color: { rgb: 'BFBFBF' } },
      right: { style: 'thin', color: { rgb: 'BFBFBF' } },
    },
  }
  const totalCols = columnas.length
  // Aplicar el estilo a cada celda de las filas 0 (grupos) y 1 (columnas),
  // creando la celda vacía si no existe (p. ej. celdas combinadas a la derecha
  // del título de grupo), para que el fondo cubra todo el span combinado.
  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c < totalCols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!sheet[ref]) sheet[ref] = { t: 's', v: '' }
      sheet[ref].s = estiloEncabezado
    }
  }
  // Congelar las dos filas de encabezado para que queden fijas al hacer scroll.
  sheet['!freeze'] = { xSplit: 0, ySplit: 2 }

  const book = XLSXStyle.utils.book_new()
  XLSXStyle.utils.book_append_sheet(book, sheet, 'Datos')
  XLSXStyle.writeFile(book, filename)
}
