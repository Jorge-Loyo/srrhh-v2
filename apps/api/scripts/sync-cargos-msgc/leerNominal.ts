// ─────────────────────────────────────────────────────────────────────────────
// Lector del CSV neutro que emite preprocesar_excel.py. SOLO LECTURA.
// Lista blanca de encabezados: rechaza cualquier columna personal (cuil, apellido,
// nombre, control) o desconocida, y cualquier `expediente` que no sea EX-AAAA-....
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import { parse as parseCsv } from 'csv-parse/sync'

export const ENCABEZADOS_NOMINAL = [
  'codigo_excel', 'cr', 'sigla', 'tipo', 'planta_guardia', 'estado', 'situacion', 'literal_puesto',
  'expediente', 'id_sial_rol', 'situacion_revista', 'acronimo', 'bloque', 'especialidad_cargo',
  'nivel_conduccion', 'cod_rep', 'detalle', 'linea_pou',
] as const

export interface FilaNominal {
  codigo_excel: string
  cr: string
  sigla: string
  tipo: string
  planta_guardia: string
  estado: string
  situacion: string
  literal_puesto: string
  /** Solo valores EX-AAAA-...; '' si la fila no tiene expediente. */
  expediente: string
  /** Clave de cruce con ocupaciones.id_sial_rol. NUNCA se escribe en salidas. */
  id_sial_rol: string
  situacion_revista: string
  acronimo: string
  bloque: string
  especialidad_cargo: string
  nivel_conduccion: string
  cod_rep: string
  detalle: string
  linea_pou: string
}

const RE_EXPEDIENTE = /^EX-\d{4}-/
const RE_ENCABEZADO_PERSONAL = /cuil|apellido|nombre|control|dni|documento/i

/** Valida los encabezados contra la lista blanca (orden libre, sin faltantes ni sobrantes). */
export function validarEncabezados(encabezados: string[]): void {
  for (const h of encabezados) {
    if (RE_ENCABEZADO_PERSONAL.test(h)) {
      throw new Error(`Encabezado personal no permitido en el CSV de entrada: "${h}"`)
    }
  }
  const permitidos = new Set<string>(ENCABEZADOS_NOMINAL)
  const desconocidos = encabezados.filter((h) => !permitidos.has(h))
  if (desconocidos.length) throw new Error(`Encabezados fuera de la lista blanca: ${desconocidos.join(', ')}`)
  const faltan = ENCABEZADOS_NOMINAL.filter((h) => !encabezados.includes(h))
  if (faltan.length) throw new Error(`Faltan encabezados: ${faltan.join(', ')}`)
}

/** Parsea y tipa el contenido de un CSV (texto). */
export function parsearNominal(contenido: string): FilaNominal[] {
  const filas: Record<string, string>[] = parseCsv(contenido, {
    columns: (h: string[]) => {
      validarEncabezados(h)
      return h
    },
    skip_empty_lines: true,
    bom: true,
    relax_column_count: false,
  })
  return filas.map((f, i) => {
    if (f.expediente && !RE_EXPEDIENTE.test(f.expediente)) {
      throw new Error(`Fila ${i + 2}: "expediente" no cumple EX-AAAA-... (posible dato personal)`)
    }
    return f as unknown as FilaNominal
  })
}

/**
 * Marca de reemplazante del Excel: `R-` adelante del codigo_excel (R-CPH-G-00001). La columna `acronimo` del
 * CSV viene SIN el R-, asi que la marca sale solo de codigo_excel. El Excel es la ley.
 */
export function esReemplazanteExcel(f: Pick<FilaNominal, 'codigo_excel'>): boolean {
  return /^R-/.test(String(f.codigo_excel ?? '').trim())
}

/** Prefijo de codigo de la fila: el acronimo del Excel con `R-` adelante si la fila es reemplazante. */
export function prefijoExcel(f: Pick<FilaNominal, 'codigo_excel' | 'acronimo'>): string {
  return esReemplazanteExcel(f) ? `R-${f.acronimo}` : f.acronimo
}

export function leerNominal(ruta: string): FilaNominal[] {
  return parsearNominal(fs.readFileSync(ruta, 'utf8'))
}
