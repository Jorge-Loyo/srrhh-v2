import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
import fs from 'node:fs'
import path from 'node:path'

const REFS = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias'

const archivos = [
  'POU_DECRETO 315-22 y modificaciones - HISTORICO.xlsx',
  'Ocupacion_POU_16-11.xlsx',
]

for (const archivo of archivos) {
  const ruta = path.join(REFS, archivo)
  const wb = XLSX.readFile(ruta)
  console.log(`\n── ${archivo} ──`)
  console.log(`   Hojas: ${wb.SheetNames.join(', ')}`)

  for (const hoja of wb.SheetNames) {
    const ws = wb.Sheets[hoja]
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ',', blankrows: false })
    const nombreBase = archivo.replace('.xlsx', '').replace(/\s+/g, '_')
    const salida = path.join(REFS, `${nombreBase}__${hoja.replace(/\s+/g, '_')}.csv`)
    fs.writeFileSync(salida, csv, 'utf8')
    const filas = csv.split('\n').length
    console.log(`   → ${path.basename(salida)} (${filas} filas)`)
  }
}
