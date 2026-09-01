import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const x = require('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx')

const wb = x.readFile('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/padron-cargos (5) (1).xlsx')
const sheet = wb.Sheets['CPH M\u00e9dico']
const rows = x.utils.sheet_to_json(sheet, { header: 1 }).slice(1)

// Mostrar todas las filas para entender la estructura
console.log('Total filas:', rows.length)
rows.forEach(function(r, i) {
  console.log('[' + i + '] puesto=' + JSON.stringify(r[3]) + ' subtipo=' + JSON.stringify(r[4]) + ' esp=' + JSON.stringify(r[6]))
})
