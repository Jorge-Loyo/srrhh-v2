// ─────────────────────────────────────────────────────────────────────────────
// Escritor de salidas del dry-run: resumen.json, resumen.md y detalle_<cat>.csv.
// Columnas fijas y validación de cada celda: rechaza 11 dígitos consecutivos (CUIL /
// ID SIAL Rol) y el patrón de rol `\d+-\d+`. Nunca recibe id_sial_rol, CUIL, nombres
// ni ids de persona (el tipo `Entrada` no los tiene).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import type { FilaPlanBorrado, ResumenBajas } from './limpieza.js'
import { CATEGORIAS, type Categoria, type ConcursoColgado, type ConcursoSinExpediente, type ConflictoExpediente, type Entrada, type ResultadoCruce } from './cruce.js'

export const COLUMNAS_DETALLE = [
  'codigo_excel', 'categoria', 'accion', 'cargo_codigo_sistema', 'codigo_propuesto',
  'acronimo', 'cr', 'sigla', 'puesto', 'motivo',
] as const

export const COLUMNAS_COLGADOS = [
  'cargo_codigo_sistema', 'estado_cargo', 'sigla', 'acronimo_propuesto', 'puesto', 'especialidad',
  'tipo_concurso', 'estado_concurso', 'sub_estado_concurso', 'activo', 'expediente_concurso',
  'motivo_concurso', 'autorizado', 'expediente_en_excel', 'fila_excel', 'otros_vinculos', 'revision',
] as const

export const COLUMNAS_CONFLICTOS = [
  'codigo_excel', 'cargo_codigo_sistema', 'sigla', 'puesto', 'bloque', 'fuente_sistema',
  'expediente_excel', 'expediente_sistema',
] as const

export const COLUMNAS_SIN_EXPEDIENTE = [
  'codigo_excel', 'sigla', 'acronimo', 'cr', 'literal_puesto', 'especialidad_cargo', 'detalle', 'tipo',
] as const

const RE_11_DIGITOS = /\d{11}/
const RE_ROL = /\d+-\d+/
/** Expediente normalizado EX-AAAA-N (hasta 10 digitos de numero: con 11 o mas digitos se rechaza como posible CUIL). */
const RE_EXPEDIENTE = /^EX-\d{4}-\d{1,10}$/

/** Lanza si la celda parece un dato personal o un rol. El mensaje NO incluye el valor. */
export function validarCelda(valor: string, contexto: string): void {
  if (RE_11_DIGITOS.test(valor)) throw new Error(`Celda rechazada (11 digitos consecutivos) en ${contexto}`)
  if (RE_ROL.test(valor)) throw new Error(`Celda rechazada (patron de rol \\d+-\\d+) en ${contexto}`)
}

/** Celda de expedientes: una lista `EX-AAAA-NNNNNNNN | ...` (o vacia). Cualquier otra cosa se valida como celda normal. */
export function validarCeldaExpediente(valor: string, contexto: string): void {
  if (valor === '') return
  const partes = valor.split(' | ')
  if (partes.every((p) => RE_EXPEDIENTE.test(p))) return
  validarCelda(valor, contexto)
  throw new Error(`Celda rechazada (no es una lista de expedientes EX-AAAA-N) en ${contexto}`)
}

/**
 * Celda de texto libre del Excel (columna «detalle»): puede traer fechas, numeros y expedientes, asi que el patron
 * de rol `\d+-\d+` no aplica. Se rechaza lo que parece un CUIL / ID SIAL Rol: 11 digitos seguidos o un legajo largo
 * seguido de rol (`\d{7,}-\d{1,2}`).
 */
export function validarCeldaDetalle(valor: string, contexto: string): void {
  if (RE_11_DIGITOS.test(valor)) throw new Error(`Celda rechazada (11 digitos consecutivos) en ${contexto}`)
  if (/(^|\D)\d{7,}-\d{1,2}(\D|$)/.test(valor)) throw new Error(`Celda rechazada (parece legajo-rol) en ${contexto}`)
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

export function csvDeColgados(filas: ConcursoColgado[]): string {
  const lineas = [COLUMNAS_COLGADOS.join(',')]
  filas.forEach((e, i) => {
    const celdas = COLUMNAS_COLGADOS.map((c) => String(e[c] ?? ''))
    celdas.forEach((v, j) => {
      const ctx = `concursos_colgados fila ${i + 1} columna ${COLUMNAS_COLGADOS[j]}`
      // fila_excel lleva codigos del Excel (AS-00001), sin expedientes: validacion comun.
      if (COLUMNAS_COLGADOS[j] === 'expediente_concurso') validarCeldaExpediente(v, ctx)
      else validarCelda(v, ctx)
    })
    lineas.push(celdas.map(celdaCsv).join(','))
  })
  return lineas.join('\n') + '\n'
}

/**
 * conflictos_expediente.csv: casos con DOS numeros de expediente distintos (Excel vs sistema) para que Jorge elija.
 * Solo expedientes normalizados; sin personas ni roles.
 */
export function csvDeConflictos(filas: ConflictoExpediente[]): string {
  const lineas = [COLUMNAS_CONFLICTOS.join(',')]
  filas.forEach((e, i) => {
    const celdas = COLUMNAS_CONFLICTOS.map((c) => String(e[c] ?? ''))
    celdas.forEach((v, j) => {
      const ctx = `conflictos_expediente fila ${i + 1} columna ${COLUMNAS_CONFLICTOS[j]}`
      if (COLUMNAS_CONFLICTOS[j] === 'expediente_excel' || COLUMNAS_CONFLICTOS[j] === 'expediente_sistema') validarCeldaExpediente(v, ctx)
      else validarCelda(v, ctx)
    })
    lineas.push(celdas.map(celdaCsv).join(','))
  })
  return lineas.join('\n') + '\n'
}

/**
 * concursos_sin_expediente.csv: una fila por concurso del Excel (bloque Concurso) sin numero de expediente, para que
 * Jorge busque la informacion. Hoy NO se crea concurso para ellos. Sin datos personales.
 */
export function csvDeSinExpediente(filas: ConcursoSinExpediente[]): string {
  const lineas = [COLUMNAS_SIN_EXPEDIENTE.join(',')]
  filas.forEach((e, i) => {
    const celdas = COLUMNAS_SIN_EXPEDIENTE.map((c) => String(e[c] ?? ''))
    celdas.forEach((v, j) => {
      const ctx = `concursos_sin_expediente fila ${i + 1} columna ${COLUMNAS_SIN_EXPEDIENTE[j]}`
      if (COLUMNAS_SIN_EXPEDIENTE[j] === 'detalle') validarCeldaDetalle(v, ctx)
      else validarCelda(v, ctx)
    })
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
  concursos_colgados: ResultadoCruce['concursos_colgados']['totales']
  /** Acciones de la Fase 2 (puestos, jefaturas, etiquetas, ampliaciones, expedientes y concursos). */
  fase2: ResultadoCruce['fase2']
  conflictos_expediente: number
  /** Concursos del Excel sin expediente (no se crean; ver concursos_sin_expediente.csv). */
  concursos_sin_expediente: { total: number; por_tipo: Record<string, number> }
  /** Plan de borrado por tabla (solo calculo/conteo read-only; no se borra nada). */
  plan_borrado?: FilaPlanBorrado[]
  /** Alcance de bajas: a borrar (de usuario) vs conservadas (por concurso del Excel / por origen import-padron). */
  bajas?: ResumenBajas
  /** Delta por categoría contra la corrida anterior (--previo). */
  delta_vs_previo?: Record<string, number>
}

export function armarResumen(
  r: ResultadoCruce,
  meta: MetaCorrida,
  previo?: ResumenJson | null,
  planBorrado?: FilaPlanBorrado[] | null,
  bajas?: ResumenBajas | null,
): ResumenJson {
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
    concursos_colgados: r.concursos_colgados.totales,
    fase2: r.fase2,
    conflictos_expediente: r.conflictos_expediente.length,
    concursos_sin_expediente: {
      total: r.concursos_sin_expediente.length,
      por_tipo: Object.fromEntries(
        ['CPH', 'CEETPS'].map((t) => [t, r.concursos_sin_expediente.filter((x) => x.tipo === t).length]),
      ),
    },
  }
  if (planBorrado) resumen.plan_borrado = planBorrado
  if (bajas) resumen.bajas = bajas
  if (previo) {
    const delta: Record<string, number> = {}
    for (const c of CATEGORIAS) delta[c] = r.conteos[c] - (previo.conteos?.[c] ?? 0)
    delta.total_excel = r.cierre.total_excel - (previo.total_excel ?? 0)
    delta.a_crear = r.cierre.a_crear - (previo.cierre?.a_crear ?? 0)
    delta.g_a_no_vigente = r.cierre.g_a_no_vigente - (previo.cierre?.g_a_no_vigente ?? 0)
    delta.proyectado_vigente_mas_validacion = r.cierre.proyectado_vigente_mas_validacion - (previo.cierre?.proyectado_vigente_mas_validacion ?? 0)
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
  l.push('## Cierre (metrica a vigilar: vigente + validacion_vacante == filas del Excel)')
  l.push('')
  const c = s.cierre
  l.push(`- **Proyectado vigente + validacion_vacante: ${c.proyectado_vigente_mas_validacion}; Excel: ${c.total_excel}; diferencia: ${c.diferencia_vigente_mas_validacion}** (${c.diferencia_vigente_mas_validacion === 0 ? 'CIERRA' : 'NO CIERRA'})`)
  if (c.diferencia_vigente_mas_validacion !== 0) {
    const d = c.diferencia_por_categoria
    l.push(`- Diferencia por categoria: a+b ${d.a_b}; c ${d.c}; d ${d.d}; e ${d.e}; i(filas del Excel sin cargo) ${d.i_filas}; cargos del sistema que quedan sin fila en el Excel ${d.sistema_sin_fila_excel}`)
  }
  l.push(`- Hoy: vigentes ${c.vigentes_hoy}; validacion_vacante ${c.validacion_vacante_hoy}`)
  l.push(`- A crear: ${c.a_crear} (c ${s.particion.c} + d ${s.particion.d} + e sin cargo para reusar ${c.a_crear - s.particion.c - s.particion.d}); de ellos ${c.a_crear_como_validacion} "En validacion" del Excel`)
  l.push(`- Filas e que reusan un cargo del sistema: ${c.e_reusadas} (por expediente: ${c.e_reusadas_por_expediente}); cargos reusados: ${c.f_reusados} vacantes vigentes + ${c.validacion_reusados} validacion_vacante`)
  l.push(`- A NO VIGENTE: ${c.f_a_no_vigente} vacantes vigentes sobrantes + ${c.validacion_a_no_vigente} validacion_vacante sobrantes + ${c.g_a_no_vigente} con ocupante fuera del Excel (g)`)
  l.push('')
  l.push('Dato secundario (solo estado vigente; los cargos reusados quedan con el estado del Excel):')
  l.push('')
  l.push(`- Proyectado solo vigente: ${c.proyectado_solo_vigente}; filas "Vigente" del Excel: ${c.excel_vigente}; diferencia: ${c.diferencia_solo_vigente} (filas "En validacion" del Excel: ${c.excel_en_validacion})`)
  l.push('')
  l.push('## Cargos candidatos al cupo (f): vacantes vigentes sin ocupante + validacion_vacante sin ocupante')
  l.push('')
  l.push(`- Total: ${s.f_desglose.vigentes + s.f_desglose.validacion_vacante} (vigentes ${s.f_desglose.vigentes}; validacion_vacante ${s.f_desglose.validacion_vacante})`)
  l.push(`- Sin vinculos: ${s.f_desglose.sin_vinculos}; con vinculos: ${s.f_desglose.con_vinculos}`)
  for (const [k, v] of Object.entries(s.f_desglose.por_vinculo)) l.push(`  - ${k}: ${v}`)
  l.push('')
  l.push('## Cupos (e vs cargos candidatos)')
  l.push('')
  l.push(`- Excel: ${s.cupos.excel}; sistema: ${s.cupos.sistema} vigentes + ${s.cupos.sistema_validacion} validacion_vacante; reusados: ${s.cupos.reusados}; faltan (a crear): ${s.cupos.faltan}; sobran (a no vigente): ${s.cupos.sobran}; claves: ${s.cupos.claves}`)
  for (const [k, v] of Object.entries(s.cupos.excel_por_bloque)) l.push(`  - bloque ${k}: ${v}`)
  l.push('')
  const col = s.concursos_colgados
  l.push('## Concursos colgados de cargos que pasan a NO VIGENTE (detalle en concursos_colgados.csv)')
  l.push('')
  l.push(`- Filas: ${col.filas}; cargos distintos: ${col.cargos}`)
  l.push(`- Por tipo: ${Object.entries(col.por_tipo).map(([t, n]) => `${t} ${n}`).join('; ') || 'ninguno'}`)
  l.push(`- Activos (regla unica de concurso activo): ${col.activos}; no activos: ${col.no_activos}`)
  for (const [t, v] of Object.entries(col.por_tipo_activo)) l.push(`  - ${t}: activos ${v.activo}; no activos ${v.no_activo}`)
  l.push(`- A revisar (concurso activo cuyo expediente SI esta en el Excel, en otra fila): ${col.revisar}`)
  l.push('')
  const f2 = s.fase2
  const lista = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `  - ${k}: ${v}`)
  l.push('## Acciones de la Fase 2 (plan, no se escribe nada)')
  l.push('')
  l.push('Puestos sucios de CR 87 / CR 85 (el codigo de registro no se toca):')
  l.push(...(Object.keys(f2.puestos_resueltos).length ? lista(f2.puestos_resueltos) : ['  - ninguno']))
  l.push(`- Marcas revisionDato: ${Object.values(f2.revision_dato).reduce((x, y) => x + y, 0)}`)
  l.push(...lista(f2.revision_dato))
  l.push(`- Etiqueta CEETPS "SI" (tipificador): ${f2.etiquetas_ceetps_si} cargos`)
  l.push(`- Ampliaciones: ${f2.ampliaciones} (con concurso ya existente en el sistema, se reusa y se conserva tal cual: ${f2.ampliaciones_con_concurso}; cargo nuevo + concurso nuevo_cargo sin autorizar, Etapa 1: ${f2.ampliaciones - f2.ampliaciones_con_concurso})`)
  l.push(`- Jefaturas con par (vinculadas por cargoBaseId): ${f2.jefaturas.con_par} (base existe ${f2.jefaturas.base_existe}; base a crear ${f2.jefaturas.base_a_crear}); vacantes -J sin par (sin cargo base, a revisar): ${f2.jefaturas.vacantes_sin_par}`)
  l.push(`- Expedientes Excel vs sistema: coinciden ${f2.expedientes.coinciden}; el Excel completa lo que falta ${f2.expedientes.a_completar}; dos numeros distintos ${f2.expedientes.conflictos} (conflictos_expediente.csv: ${s.conflictos_expediente} filas)`)
  l.push('')
  const k = f2.concursos
  l.push('Concursos (solo deben quedar los que estan en el Excel, cruce por expediente normalizado):')
  l.push(`- En el sistema: ${k.sistema}; se conservan ${k.mantener} (+ ${k.mantener_a_reasignar} hoy en cargos que pasan a no vigente: reasignar); se ELIMINAN ${k.eliminar}`)
  l.push(`- Eliminar por tipo: ${Object.entries(k.eliminar_por_tipo).map(([t, n]) => `${t} ${n}`).join('; ') || 'ninguno'}; activos ${k.eliminar_activos}; de cargo nuevo (pruebas) ${k.eliminar_nuevo_cargo}; en cargo que pasa a no vigente ${k.eliminar_en_cargo_no_vigente}; sin expediente ${k.eliminar_sin_expediente}`)
  l.push(`- A crear: ${k.crear_desde_excel} desde el Excel con expediente (caratulado, sin autorizar, detalle en observaciones) + ${k.crear_nuevo_cargo} ampliaciones (nuevo_cargo sin autorizar)`)
  l.push(`- Concursos del Excel SIN expediente: ${s.concursos_sin_expediente.total} (CPH ${s.concursos_sin_expediente.por_tipo.CPH ?? 0}; CEETPS ${s.concursos_sin_expediente.por_tipo.CEETPS ?? 0}). NO se crea concurso para ellos hasta que Jorge complete el expediente (sin numero no se pueden reconocer en la corrida siguiente); el cargo si se crea/reusa. Listado en concursos_sin_expediente.csv`)
  l.push(`- Expediente en 2+ cargos del Excel: valido (baja/creacion) ${k.expediente_repetido_valido}; error (concurso) ${k.expediente_repetido_error}`)
  l.push('')
  if (s.plan_borrado) {
    l.push('## Plan de borrado (limpieza previa a la nueva carga; SOLO conteo, no se borra nada)')
    l.push('')
    l.push('| Tabla | Alcance | Filas a borrar | Total en tabla |')
    l.push('|---|---|---|---|')
    for (const p of s.plan_borrado) {
      l.push(`| ${p.tabla} | ${p.alcance === 'todo' ? 'todo' : p.alcance === 'bajas_usuario' ? 'solo de usuario, sin concurso conservado' : 'fuera del Excel'} | ${p.filas}${p.exacto ? '' : ' (cota superior)'} | ${p.total} |`)
    }
    l.push(`- Total de filas a borrar: ${s.plan_borrado.reduce((a, p) => a + p.filas, 0)}`)
    if (s.bajas) {
      l.push('')
      l.push('Bajas (solo se borran las cargadas por un usuario, registrado_por no nulo, que no sostienen un concurso conservado):')
      l.push(`- Bajas a borrar: ${s.bajas.a_borrar} (de ${s.bajas.con_usuario} cargadas por un usuario)`)
      l.push(`- Bajas conservadas por concurso del Excel (cargadas por usuario, las referencia un concurso que se conserva): ${s.bajas.conservadas_por_concurso}`)
      l.push(`- Bajas conservadas por origen import/padron (sin usuario: SIAL, alta por baja, backfill), aunque su concurso se borre: ${s.bajas.conservadas_por_origen}`)
    }
    l.push('')
  }
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
  archivos.push(['concursos_colgados.csv', csvDeColgados(r.concursos_colgados.filas)])
  archivos.push(['conflictos_expediente.csv', csvDeConflictos(r.conflictos_expediente)])
  archivos.push(['concursos_sin_expediente.csv', csvDeSinExpediente(r.concursos_sin_expediente)])
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
