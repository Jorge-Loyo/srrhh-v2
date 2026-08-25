// S3-10: "Exportar a Excel" — sin agregar una librería nueva (no hay
// xlsx/sheetjs en el proyecto, y es una tarea 🟢 Bajo del sprint), se genera
// un CSV con BOM UTF-8: Excel lo abre nativamente como si fuera un .xlsx —
// doble click abre la app, respeta columnas — y el BOM es necesario para que
// no muestre "Ã±" en vez de "ñ" al interpretar el archivo como Windows-1252
// por default. Si en algún sprint futuro hace falta un .xlsx real (estilos,
// múltiples hojas), ahí sí vale la pena sumar `xlsx`.
export interface CsvColumn<T> {
  key: keyof T
  label: string
}

export function exportToCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  const header = columns.map((c) => csvEscape(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(',')).join('\n')
  const csv = `${header}\n${body}`

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}
