import * as XLSX from 'xlsx'
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
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Datos')
  XLSX.writeFile(book, filename)
}
