/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Verifica acronimoMsgc() contra la columna Q (acrónimo) y el flag `R-` contra el
// prefijo del Código de Cargo, sobre el CSV de preprocesar_excel.py. SOLO LECTURA.
// Imprime `<ok>/<total>` y las discrepancias SIN datos personales (solo código del Excel).
//
// Uso: pnpm --filter @srrhh/api exec tsx scripts/sync-cargos-msgc/verificar-acronimos.ts --input <csv>
// ─────────────────────────────────────────────────────────────────────────────
import { leerNominal, type FilaNominal } from './leerNominal.js'
import { acronimoMsgc, prefijoCodigoMsgc } from './acronimoMsgc.js'

/** Traduce una fila del Excel a la entrada de la función pura. */
export function entradaDeFila(f: FilaNominal) {
  return {
    cr: f.cr,
    literalPuesto: f.literal_puesto,
    plantaGuardia: f.planta_guardia,
    nivelConduccion: f.nivel_conduccion,
    // Tipo Conducción / Estructura = el cargo está en el árbol (Criterios, "Tipo").
    tieneLineaArbol: f.tipo === 'Conducción' || f.tipo === 'Estructura',
    reemplazante: f.codigo_excel.startsWith('R-'),
  }
}

export interface Discrepancia {
  codigo_excel: string
  esperado: string
  calculado: string | null
}

export function verificar(filas: FilaNominal[]): { ok: number; total: number; discrepancias: Discrepancia[] } {
  const discrepancias: Discrepancia[] = []
  let ok = 0
  for (const f of filas) {
    const e = entradaDeFila(f)
    const calculado = acronimoMsgc(e)
    // El prefijo del código debe ser `R-` + acrónimo si es reemplazante; si no, el acrónimo solo.
    const prefijo = prefijoCodigoMsgc(e)
    const esperadoPrefijo = (f.codigo_excel.startsWith('R-') ? 'R-' : '') + f.acronimo
    const empiezaBien = f.codigo_excel.startsWith(`${esperadoPrefijo}-`)
    if (calculado === f.acronimo && prefijo === esperadoPrefijo && empiezaBien) ok++
    else discrepancias.push({ codigo_excel: f.codigo_excel, esperado: f.acronimo, calculado })
  }
  return { ok, total: filas.length, discrepancias }
}

function main() {
  const i = process.argv.indexOf('--input')
  if (i < 0 || !process.argv[i + 1]) {
    console.error('Uso: verificar-acronimos.ts --input <nominal.csv>')
    process.exit(2)
  }
  const r = verificar(leerNominal(process.argv[i + 1]))
  console.log(`${r.ok}/${r.total}`)
  for (const d of r.discrepancias.slice(0, 50)) {
    console.log(`DISCREPANCIA ${d.codigo_excel}: Excel=${d.esperado} calculado=${d.calculado ?? 'null'}`)
  }
  if (r.discrepancias.length > 50) console.log(`... y ${r.discrepancias.length - 50} más`)
  process.exit(r.discrepancias.length === 0 ? 0 : 1)
}

// Solo corre como CLI (no al importarlo desde un test).
if (process.argv[1] && /verificar-acronimos\.[tj]s$/.test(process.argv[1].replace(/\\/g, '/'))) main()
