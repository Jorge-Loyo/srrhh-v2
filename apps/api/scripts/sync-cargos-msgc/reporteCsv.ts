// ─────────────────────────────────────────────────────────────────────────────
// Escritor de salidas del dry-run: resumen.json, resumen.md y detalle_<cat>.csv.
// Columnas fijas y validación de cada celda: rechaza 11 dígitos consecutivos (CUIL /
// ID SIAL Rol) y el patrón de rol `\d+-\d+`. Nunca recibe id_sial_rol, CUIL, nombres
// ni ids de persona (el tipo `Entrada` no los tiene).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { CATEGORIAS, type Categoria, type Entrada, type ResultadoCruce } from './cruce.js'

export const COLUMNAS_DETALLE = [
  'codigo_excel', 'categoria', 'accion', 'cargo_codigo_sistema', 'codigo_propuesto',
  'acronimo', 'cr', 'sigla', 'puesto', 'motivo',
] as const

const RE_11_DIGITOS = /\d{11}/
const RE_ROL = /\d+-\d+/

/** Lanza si la celda parece un dato personal o un rol. El mensaje NO incluye el valor. */
export function validarCelda(valor: string, contexto: string): void {
  if (RE_11_DIGITOS.test(valor)) throw new Error(`Celda rechazada (11 digitos consecutivos) en ${contexto}`)
  if (RE_ROL.test(valor)) throw new Error(`Celda rechazada (patron de rol \\d+-\\d+) en ${contexto}`)
}

function celdaCsv(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function csvDeEntradas(categoria: Categoria, entradas: Entrada[]): string {
  const lineas = [COLUMNAS_DETALLE.join(',')]
  entradas.forEach((e, i) => {
    const celdas = COLUMNAS_DETALLE.map((c) => String(e[c] ?? ''))
    celdas.forEach((v, j) => validarCelda(v, `detalle_${categoria} fila ${i + 1} columna ${COLUMNAS_DETALLE[j]}`))
    lineas.push(celdas.map(celdaCsv).join(','))
  })
  return lineas.join('\n') + '\n'
}

export interface MetaCorrida {
  corte: string | null
  sha256: string | null
  version_equivalencias: string
}

export interface ResumenJson extends MetaCorrida {
  total_excel: number
  conteos: Record<Categoria, number>
  particion: ResultadoCruce['particion']
  cierre: ResultadoCruce['cierre']
  cupos: ResultadoCruce['cupos']
  f_desglose: ResultadoCruce['f_desglose']
  h_desglose: ResultadoCruce['h_desglose']
  colisiones: number
  j_por_motivo: Record<string, number>
  /** Delta por categoría contra la corrida anterior (--previo). */
  delta_vs_previo?: Record<string, number>
}

export function armarResumen(r: ResultadoCruce, meta: MetaCorrida, previo?: ResumenJson | null): ResumenJson {
  const resumen: ResumenJson = {
    ...meta,
    total_excel: r.cierre.total_excel,
    conteos: r.conteos,
    particion: r.particion,
    cierre: r.cierre,
    cupos: r.cupos,
    f_desglose: r.f_desglose,
    h_desglose: r.h_desglose,
    colisiones: r.colisiones,
    j_por_motivo: r.j_por_motivo,
  }
  if (previo) {
    const delta: Record<string, number> = {}
    for (const c of CATEGORIAS) delta[c] = r.conteos[c] - (previo.conteos?.[c] ?? 0)
    delta.total_excel = r.cierre.total_excel - (previo.total_excel ?? 0)
    delta.a_crear = r.cierre.a_crear - (previo.cierre?.a_crear ?? 0)
    delta.g_a_no_vigente = r.cierre.g_a_no_vigente - (previo.cierre?.g_a_no_vigente ?? 0)
    resumen.delta_vs_previo = delta
  }
  return resumen
}

export function markdownDeResumen(s: ResumenJson): string {
  const l: string[] = []
  l.push('# Dry-run sync de cargos con el Excel MSGC (SOLO LECTURA: no se escribio nada)')
  l.push('')
  l.push(`- Corte: ${s.corte ?? 'desconocido'}`)
  l.push(`- sha256 del Excel: ${s.sha256 ?? 'desconocido'}`)
  l.push(`- Version de equivalencias: ${s.version_equivalencias}`)
  l.push(`- Filas del Excel: ${s.total_excel}`)
  l.push('')
  l.push('## Categorias')
  l.push('')
  l.push('| Cat | Entradas |')
  l.push('|---|---|')
  for (const c of CATEGORIAS) l.push(`| ${c} | ${s.conteos[c]} |`)
  l.push('')
  l.push(`Particion de filas del Excel: a ${s.particion.a} + b ${s.particion.b} + c ${s.particion.c} + d ${s.particion.d} + e ${s.particion.e} + i(filas) ${s.particion.i_filas} = ${s.particion.suma} (Excel: ${s.total_excel}).`)
  l.push('')
  l.push('## Cierre')
  l.push('')
  const c = s.cierre
  l.push(`- Vigentes hoy: ${c.vigentes_hoy}; validacion_vacante hoy: ${c.validacion_vacante_hoy}`)
  l.push(`- A crear (c+d+e): ${c.a_crear} (de ellos ${c.a_crear_como_validacion} "En validacion" del Excel)`)
  l.push(`- Vacantes del sistema reemplazadas (f): ${c.f_reemplazados}; a no vigente (g): ${c.g_a_no_vigente}`)
  l.push(`- Proyectado solo vigente: ${c.proyectado_solo_vigente} (diferencia contra Excel: ${c.diferencia_solo_vigente})`)
  l.push(`- Proyectado vigente + validacion_vacante: ${c.proyectado_vigente_mas_validacion} (diferencia contra Excel: ${c.diferencia_vigente_mas_validacion})`)
  l.push('')
  l.push('## Vacantes del sistema (f)')
  l.push('')
  l.push(`- Sin vinculos: ${s.f_desglose.sin_vinculos}; con vinculos: ${s.f_desglose.con_vinculos}`)
  for (const [k, v] of Object.entries(s.f_desglose.por_vinculo)) l.push(`  - ${k}: ${v}`)
  l.push('')
  l.push('## Cupos (e vs vacantes del sistema)')
  l.push('')
  l.push(`- Excel: ${s.cupos.excel}; sistema: ${s.cupos.sistema}; faltan: ${s.cupos.faltan}; sobran: ${s.cupos.sobran}; claves: ${s.cupos.claves}`)
  for (const [k, v] of Object.entries(s.cupos.excel_por_bloque)) l.push(`  - bloque ${k}: ${v}`)
  l.push('')
  l.push('## Informativo (h) y colisiones')
  l.push('')
  l.push(`- no_vigente: ${s.h_desglose.no_vigente}; validacion_vacante: ${s.h_desglose.validacion_vacante}; eliminados: ${s.h_desglose.eliminado}`)
  l.push(`- Entradas de colision de recodificacion: ${s.colisiones}`)
  l.push('')
  l.push('## No resolubles contra catalogos (j)')
  l.push('')
  for (const [k, v] of Object.entries(s.j_por_motivo)) l.push(`- ${k}: ${v}`)
  if (Object.keys(s.j_por_motivo).length === 0) l.push('- ninguna')
  if (s.delta_vs_previo) {
    l.push('')
    l.push('## Delta contra la corrida anterior')
    l.push('')
    for (const [k, v] of Object.entries(s.delta_vs_previo)) l.push(`- ${k}: ${v >= 0 ? '+' : ''}${v}`)
  }
  l.push('')
  return l.join('\n')
}

/** Escribe todos los archivos. Valida TODO antes de escribir el primero. */
export function escribirReporte(dir: string, r: ResultadoCruce, resumen: ResumenJson): string[] {
  const archivos: [string, string][] = []
  for (const cat of CATEGORIAS) archivos.push([`detalle_${cat}.csv`, csvDeEntradas(cat, r.entradas[cat])])
  const json = JSON.stringify(resumen, null, 2) + '\n'
  const md = markdownDeResumen(resumen)
  // El sha256 (hex) puede contener 11 digitos seguidos por azar: se excluye del chequeo.
  // El patron de rol no aplica aca (las fechas del corte son AAAA-MM-DD).
  for (const [n, t] of [['resumen.json', json], ['resumen.md', md]] as const) {
    const sinSha = resumen.sha256 ? t.split(resumen.sha256).join('') : t
    if (RE_11_DIGITOS.test(sinSha)) throw new Error(`Salida rechazada (11 digitos consecutivos) en ${n}`)
  }
  archivos.push(['resumen.json', json], ['resumen.md', md])
  fs.mkdirSync(dir, { recursive: true })
  for (const [nombre, contenido] of archivos) fs.writeFileSync(path.join(dir, nombre), contenido, 'utf8')
  return archivos.map(([n]) => n)
}
