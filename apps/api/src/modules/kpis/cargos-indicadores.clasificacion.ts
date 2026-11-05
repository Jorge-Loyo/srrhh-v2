// Indicadores de cargos — lógica PURA (sin Prisma, sin BD).
//
// Cada cargo existente en una fecha de corte F cae en UNA sola hoja (cascada
// R1..R9). Los no vigentes caen en la hoja 'excluido': existe para que la suma
// por construcción cierre contra el total de cargos de la base, pero NO suma al
// "Total a gestionar" (validación + vigente). NO existe hoja 'indeterminado':
// todo cargo cae en algo concreto (un cargo en validacion_vacante sin concurso
// va a 'validacion'; vigente sin ocupante con concurso en curso va a 'concurso').
// La SQL del servicio solo agrupa "hechos" y esta función decide la hoja; las
// columnas padre (ocupado, vigente, total) son sumas de hojas, así que los
// grupos son excluyentes y la conciliación vale por construcción.
// Pensado para ser reutilizable por otros módulos (p. ej. Incidencias).
import type {
  CargosIndicadores,
  CargosIndicadoresCelda,
  CargosIndicadoresColumnaId,
  CargosIndicadoresColumnaMeta,
  CargosIndicadoresFila,
  CargosIndicadoresPeriodo,
  CargosIndicadoresTablaMeta,
  CargosIndicadoresTendencia,
} from '@srrhh/types'
import { AppError } from '../../shared/errors/AppError.js'

export type HojaCargo =
  | 'excluido'
  | 'validacion'
  | 'ocupado_activo'
  | 'ocupado_comision'
  | 'ocupado_retencion'
  | 'ocupado_otra'
  | 'vacante'
  | 'concurso'

export const HOJAS: readonly HojaCargo[] = [
  'excluido',
  'validacion',
  'ocupado_activo',
  'ocupado_comision',
  'ocupado_retencion',
  'ocupado_otra',
  'vacante',
  'concurso',
]

// Sub-estados CPH de Etapa 2+ (admisión a conc_rows; la pertenencia "en curso"
// se decide por fechas, no por este valor). Excluye a propósito 'o-alta sial',
// 'n-designado', 'h-tad' y 'm-reso a la firma', que la SQL agrega en línea.
export const SUB_ESTADOS_CONCURSO_CPH: readonly string[] = [
  'a-autzn',
  'b-sorteo jur',
  'c-dispo de llamado',
  'c2-inscripcion ex',
  'd-examen publicado',
  'e-orden de merito',
  'f-ifacs',
  'g-insal',
  'i-carga docu',
  'j-apto med',
  'k-ite',
  'l-pycto de reso',
]

/** Hojas que componen el "Total a gestionar" (todas menos 'excluido'). */
export const HOJAS_GESTIONABLES: readonly HojaCargo[] = HOJAS.filter((h) => h !== 'excluido')

export type ConcursoFact = 'si' | 'no' | 'desconocido'
export type EdRel = 'null' | 'le' | 'gt'
export type ModoCorte = 'vivo' | 'corte'

export interface HechosCargo {
  estado: string
  edRel: EdRel
  /** Situaciones de revista (normalizadas) de los ocupantes en F; null/vacío = sin ocupante. */
  sits: string[] | null
  sitAprox: boolean
  concurso: ConcursoFact
  modo: ModoCorte
  /**
   * Solo para estado 'no_vigente': la fecha de pasaje (edRel) fue INFERIDA (baja
   * confirmada por el padrón, que no toca estado_desde). Ver design.md §18.
   */
  pasoAprox?: boolean
}

export interface Clasificacion {
  hoja: HojaCargo
  aprox: boolean
}

type HojaOcupado = 'ocupado_activo' | 'ocupado_comision' | 'ocupado_retencion' | 'ocupado_otra'

/** Situación representante de un cargo con varios ocupantes: activo > comisión > retención > otra. */
export function elegirSituacion(sits: readonly string[]): HojaOcupado {
  if (sits.includes('activo')) return 'ocupado_activo'
  if (sits.includes('comision')) return 'ocupado_comision'
  if (sits.includes('retencion de cargo')) return 'ocupado_retencion'
  return 'ocupado_otra'
}

/** Cascada de clasificación. Total: toda combinación de hechos devuelve exactamente una hoja. */
export function clasificarCargo(h: HechosCargo): Clasificacion {
  const esCorte = h.modo === 'corte'
  const { estado, edRel } = h
  if (estado !== 'vigente' && estado !== 'validacion_vacante' && estado !== 'no_vigente') {
    return { hoja: 'excluido', aprox: true } // R1: estado inesperado -> excluido (no debería haber ninguno)
  }
  if (estado === 'validacion_vacante' && edRel === 'le') return { hoja: 'validacion', aprox: false } // R2
  // R2a: no vigente al corte -> fuera del total a gestionar (aprox solo si la fecha de pasaje es inferida)
  if (estado === 'no_vigente' && edRel === 'le') return { hoja: 'excluido', aprox: esCorte && h.pasoAprox === true }
  if (edRel === 'null' && estado !== 'vigente') {
    // R2b: sin fecha de entrada al estado
    return { hoja: estado === 'no_vigente' ? 'excluido' : 'validacion', aprox: true }
  }
  if (h.sits && h.sits.length > 0) return { hoja: elegirSituacion(h.sits), aprox: h.sitAprox } // R3
  if (h.concurso === 'si') return { hoja: 'concurso', aprox: true } // R4
  // R5: concurso 'desconocido'. En vivo el estado del concurso manda -> 'concurso'.
  // En corte no se inventa un número para el pasado: cae en 'validacion' (conservador).
  if (h.concurso === 'desconocido') return { hoja: esCorte ? 'validacion' : 'concurso', aprox: true } // R5
  if (estado === 'vigente' && edRel === 'gt') return { hoja: 'validacion', aprox: true } // R6: vigente entrado tras el corte -> validacion
  if (estado === 'no_vigente') return { hoja: 'validacion', aprox: true } // R7
  if (estado === 'validacion_vacante') return { hoja: 'validacion', aprox: true } // R8
  return { hoja: 'vacante', aprox: true } // R9
}

// ─── Concursos ───────────────────────────────────────────────────────────────
// Fechas como 'YYYY-MM-DD' (la comparación lexicográfica es válida).

export interface ConcursoFechas {
  ini: string | null
  fin: string | null
  cierreSinFecha: boolean
  /**
   * El concurso está en curso por su estado (CEETPS autorizado/en_proceso). En modo
   * vivo el estado manda: cuenta como 'si' aunque no tenga fecha de autorización (ini).
   * En modo corte la fecha sigue mandando (no se sabe el pasado por el estado de hoy).
   */
  enCurso?: boolean
}

/** Tri-estado de UN concurso en la fecha F (transcripción de la SQL de `conc`). */
export function concursoAlCorte(c: ConcursoFechas, F: string, modoVivo = false): ConcursoFact {
  const finLeF = c.fin !== null && c.fin <= F
  const iniLeF = c.ini !== null && c.ini <= F
  // En vivo, un concurso en curso por su estado (CEETPS autorizado/en_proceso) sin cierre
  // cuenta como 'si' aunque no tenga fecha de autorización: el estado manda.
  const enCursoVivo = modoVivo && c.enCurso === true && !finLeF
  const si = enCursoVivo || (iniLeF && !(c.cierreSinFecha && c.fin === null) && (c.fin === null || c.fin > F))
  if (si) return 'si'
  const desconocido = !finLeF && (c.ini === null || (c.cierreSinFecha && c.fin === null && iniLeF))
  return desconocido ? 'desconocido' : 'no'
}

/** Un cargo es 'si' si algún concurso da 'si'; si no 'desconocido' si alguno lo da; si no 'no'. */
export function concursosAlCorte(cs: readonly ConcursoFechas[], F: string, modoVivo = false): ConcursoFact {
  let res: ConcursoFact = 'no'
  for (const c of cs) {
    const r = concursoAlCorte(c, F, modoVivo)
    if (r === 'si') return 'si'
    if (r === 'desconocido') res = 'desconocido'
  }
  return res
}

/** Fin de un concurso: mínimo de los cierres no nulos (desierto, alta posterior, concurso siguiente). */
export function finConcurso(x: {
  desierto?: string | null
  ocupacionPosterior?: string | null
  concursoSiguiente?: string | null
}): string | null {
  const fechas = [x.desierto, x.ocupacionPosterior, x.concursoSiguiente].filter(
    (f): f is string => typeof f === 'string' && f.length > 0,
  )
  if (fechas.length === 0) return null
  return fechas.reduce((a, b) => (b < a ? b : a))
}

// ─── Disponibilidad de un período reconstruido ───────────────────────────────

export function evaluarDisponibilidad(
  F: string,
  x: { primerDatos: string | null; cargaInicial: string | null; override: string | null },
): { disponible: boolean; motivo: string | null } {
  if (!x.primerDatos) return { disponible: false, motivo: 'sin padrones aprobados' }
  if (F < x.primerDatos) {
    return { disponible: false, motivo: `anterior al primer padrón aprobado (${x.primerDatos})` }
  }
  if (x.override === null && x.cargaInicial !== null && F < x.cargaInicial) {
    return { disponible: false, motivo: `anterior a la carga inicial de cargos (${x.cargaInicial})` }
  }
  return { disponible: true, motivo: null }
}

// ─── Agregación ──────────────────────────────────────────────────────────────

export interface FilaHecho extends Omit<HechosCargo, 'modo'> {
  carreraId: string | null
  n: number
}
export interface FilaHoja {
  carreraId: string | null
  hoja: HojaCargo
  aprox: boolean
  n: number
}
export interface ConteoHoja {
  n: number
  aprox: number
}
export type HojasConteo = Record<HojaCargo, ConteoHoja>
export type ColumnasBase = Exclude<CargosIndicadoresColumnaId, 'personas_ref'>
export type ColumnasConteo = Record<ColumnasBase, ConteoHoja>

export function clasificarFilas(filas: readonly FilaHecho[], modo: ModoCorte): FilaHoja[] {
  return filas.map((f) => {
    const { hoja, aprox } = clasificarCargo({ ...f, modo })
    return { carreraId: f.carreraId, hoja, aprox, n: f.n }
  })
}

function hojasVacias(): HojasConteo {
  const r = {} as HojasConteo
  for (const h of HOJAS) r[h] = { n: 0, aprox: 0 }
  return r
}

/** Suma n por carrera y hoja. Clave de carrera: id o '' para "(sin código)". */
export function agregarHojas(filas: readonly FilaHoja[]): Map<string, HojasConteo> {
  const out = new Map<string, HojasConteo>()
  for (const f of filas) {
    const k = f.carreraId ?? ''
    let hojas = out.get(k)
    if (!hojas) {
      hojas = hojasVacias()
      out.set(k, hojas)
    }
    hojas[f.hoja].n += f.n
    if (f.aprox) hojas[f.hoja].aprox += f.n
  }
  return out
}

function sumar(hojas: HojasConteo, ids: readonly HojaCargo[]): ConteoHoja {
  return ids.reduce(
    (acc, id) => ({ n: acc.n + hojas[id].n, aprox: acc.aprox + hojas[id].aprox }),
    { n: 0, aprox: 0 },
  )
}

const OCUPADO_HOJAS: readonly HojaCargo[] = [
  'ocupado_activo',
  'ocupado_comision',
  'ocupado_retencion',
  'ocupado_otra',
]

/** Columnas derivadas: ocupado, vigente y total son SUMAS de hojas. */
export function derivarColumnas(hojas: HojasConteo): ColumnasConteo {
  return {
    total: sumar(hojas, HOJAS_GESTIONABLES),
    validacion: hojas.validacion,
    vigente: sumar(hojas, [...OCUPADO_HOJAS, 'vacante', 'concurso']),
    ocupado: sumar(hojas, OCUPADO_HOJAS),
    ocupado_activo: hojas.ocupado_activo,
    ocupado_comision: hojas.ocupado_comision,
    ocupado_retencion: hojas.ocupado_retencion,
    ocupado_otra: hojas.ocupado_otra,
    vacante: hojas.vacante,
    concurso: hojas.concurso,
  }
}

export function sumarHojas(a: HojasConteo, b: HojasConteo): HojasConteo {
  const r = hojasVacias()
  for (const h of HOJAS) r[h] = { n: a[h].n + b[h].n, aprox: a[h].aprox + b[h].aprox }
  return r
}

export function variacion(
  actual: number | null,
  anterior: number | null,
): { abs: number | null; pct: number | null; tendencia: CargosIndicadoresTendencia | null } {
  if (actual === null || anterior === null) return { abs: null, pct: null, tendencia: null }
  const abs = actual - anterior
  const tendencia: CargosIndicadoresTendencia = abs > 0 ? 'sube' : abs < 0 ? 'baja' : 'igual'
  let pct: number | null
  if (anterior === 0) pct = actual === 0 ? 0 : null
  else pct = Math.round((abs / anterior) * 10000) / 100
  return { abs, pct, tendencia }
}

/**
 * Verificación de runtime: detecta filas descartadas o una hoja sin sumar (no una falla de la partición).
 * `totalBase` = todos los cargos existentes; gestionables + excluidos debe darlo. `total` = total a gestionar.
 */
export function verificarConciliacion(
  filas: readonly FilaHoja[],
  totalBase: number,
): { ok: boolean; total: number } {
  const suma = filas.reduce((a, f) => a + f.n, 0)
  const hojas = [...agregarHojas(filas).values()].reduce(sumarHojas, hojasVacias())
  const derivado = derivarColumnas(hojas).total.n
  return { ok: suma === totalBase && derivado + hojas.excluido.n === totalBase, total: derivado }
}

// ─── Períodos ────────────────────────────────────────────────────────────────

export interface PeriodoResuelto {
  mes: string
  /** Primer día del mes ('YYYY-MM-01'): inicio de la ventana de "pasaron a no vigente". */
  desde: string
  fechaCorte: string
  modo: 'vivo' | 'reconstruido'
}

/** Fecha civil argentina ('YYYY-MM-DD') de un instante. */
export function fechaCivilArgentina(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function ultimoDiaDelMes(anio: number, mes1a12: number): string {
  const d = new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate()
  return `${anio}-${String(mes1a12).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function finDeMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number) as [number, number]
  return ultimoDiaDelMes(y, m)
}

export function resolverPeriodos(
  mes: string | undefined,
  hoy: string,
): { actual: PeriodoResuelto; anterior: PeriodoResuelto } {
  const mesHoy = hoy.slice(0, 7)
  const mesRef = mes ?? mesHoy
  if (mesRef > mesHoy) throw AppError.badRequest('El mes no puede ser futuro')
  const prev = mesAnterior(mesRef)
  const anterior: PeriodoResuelto = {
    mes: prev,
    desde: `${prev}-01`,
    fechaCorte: finDeMes(prev),
    modo: 'reconstruido',
  }
  if (mesRef === mesHoy) {
    return { actual: { mes: mesRef, desde: `${mesRef}-01`, fechaCorte: hoy, modo: 'vivo' }, anterior }
  }
  return {
    actual: { mes: mesRef, desde: `${mesRef}-01`, fechaCorte: finDeMes(mesRef), modo: 'reconstruido' },
    anterior,
  }
}

// ─── Respuesta ───────────────────────────────────────────────────────────────

export interface CarreraCatalogo {
  id: string
  codigo: string
  literal: string
}

/** Cargos hoy no vigentes cuya transición cae en la ventana del período (por carrera). */
export interface FilaPaso {
  carreraId: string | null
  n: number
  /** De esos n, cuántos tienen fecha de pasaje inferida (~). */
  aprox: number
}

export interface DatosPeriodo {
  periodo: CargosIndicadoresPeriodo
  /** Pasajes a no vigente en la ventana del período; null = período no disponible (n/d). */
  pasaron: FilaPaso[] | null
  /** null = período no disponible (todas las celdas n/d). */
  filas: FilaHoja[] | null
  /** Personas por código de carrera (kpis_dotacion_snapshot '(total)'); null = sin dato. */
  personas: { codigo: string; personas: number }[] | null
  personasFecha: string | null
}

const SIN_CODIGO = '(sin codigo)'

const COLUMNAS_META: Record<ColumnasBase | 'personas_ref', { etiqueta: string; nota: string | null }> = {
  total: {
    etiqueta: 'Total a gestionar',
    nota: 'Cargos gestionables (sobre los que se generan bajas, concursos y nuevos cargos), no la dotación total. En validación + Vigente. No incluye los cargos no vigentes.',
  },
  validacion: { etiqueta: 'En validación', nota: 'Estado validacion_vacante.' },
  vigente: { etiqueta: 'Vigente', nota: 'Ocupado + Vacante + Concurso.' },
  ocupado: { etiqueta: 'Ocupado', nota: 'Cargos con ocupante vigente a la fecha.' },
  ocupado_activo: { etiqueta: 'Activo', nota: null },
  ocupado_comision: { etiqueta: 'Comisión', nota: null },
  ocupado_retencion: { etiqueta: 'Retención de cargo', nota: null },
  ocupado_otra: { etiqueta: 'Otras / sin dato', nota: 'Situación de revista fuera del catálogo o sin dato.' },
  vacante: { etiqueta: 'Vacante', nota: 'Vigente sin ocupante ni concurso en curso.' },
  concurso: { etiqueta: 'Concurso', nota: 'Vigente sin ocupante, con concurso en curso (Etapa 2+).' },
  personas_ref: {
    etiqueta: 'Personas (Evolución de dotación)',
    nota: 'Referencia informativa de personas (no cargos). No entra en las sumas.',
  },
}

function meta(id: CargosIndicadoresColumnaId, destacada: boolean): CargosIndicadoresColumnaMeta {
  return { id, etiqueta: COLUMNAS_META[id].etiqueta, destacada, nota: COLUMNAS_META[id].nota }
}

export function columnasVisibles(): CargosIndicadoresTablaMeta[] {
  const estado: CargosIndicadoresColumnaMeta[] = [
    meta('total', true),
    meta('validacion', false),
    meta('vigente', false),
  ]
  return [
    { id: 'estado', titulo: 'Estado del cargo', nota: null, columnas: estado },
    {
      id: 'vigente',
      titulo: 'Dentro de Vigente',
      nota: null,
      columnas: [meta('vigente', true), meta('ocupado', false), meta('vacante', false), meta('concurso', false)],
    },
    {
      id: 'ocupado',
      titulo: 'Dentro de Ocupado, por situación de revista',
      nota: null,
      columnas: [
        meta('ocupado', true),
        meta('ocupado_activo', false),
        meta('ocupado_comision', false),
        meta('ocupado_retencion', false),
        meta('ocupado_otra', false),
        meta('personas_ref', false),
      ],
    },
  ]
}

const COLUMNAS_TODAS: CargosIndicadoresColumnaId[] = [
  'total',
  'validacion',
  'vigente',
  'ocupado',
  'ocupado_activo',
  'ocupado_comision',
  'ocupado_retencion',
  'ocupado_otra',
  'vacante',
  'concurso',
  'personas_ref',
]

function celdaDe(
  act: ConteoHoja | null,
  ant: ConteoHoja | null,
): CargosIndicadoresCelda {
  return celdaNum(act?.n ?? null, act?.aprox ?? 0, ant?.n ?? null, ant?.aprox ?? 0)
}

function celdaNum(actual: number | null, aA: number, anterior: number | null, aP: number): CargosIndicadoresCelda {
  const v = variacion(actual, anterior)
  return {
    actual,
    actualAprox: aA,
    anterior,
    anteriorAprox: aP,
    variacionAbs: v.abs,
    variacionPct: v.pct,
    tendencia: v.tendencia,
  }
}

function agregarPasos(filas: readonly FilaPaso[] | null): Map<string, ConteoHoja> | null {
  if (!filas) return null
  const out = new Map<string, ConteoHoja>()
  for (const f of filas) {
    const k = f.carreraId ?? ''
    const c = out.get(k) ?? { n: 0, aprox: 0 }
    c.n += f.n
    c.aprox += f.aprox
    out.set(k, c)
  }
  return out
}

function sumaPasos(m: Map<string, ConteoHoja> | null): ConteoHoja | null {
  if (!m) return null
  return [...m.values()].reduce((a, c) => ({ n: a.n + c.n, aprox: a.aprox + c.aprox }), { n: 0, aprox: 0 })
}

/** Período disponible sin pasajes en la carrera = 0; período no disponible = n/d (null). */
function celdaPaso(
  a: ConteoHoja | null,
  p: ConteoHoja | null,
  dispA: boolean,
  dispP: boolean,
): CargosIndicadoresCelda {
  const cero = { n: 0, aprox: 0 }
  return celdaDe(dispA ? (a ?? cero) : null, dispP ? (p ?? cero) : null)
}

function ordenarCodigos(a: string, b: string): number {
  const na = /^\d+$/.test(a)
  const nb = /^\d+$/.test(b)
  if (na && nb) return Number(a) - Number(b)
  if (na) return -1
  if (nb) return 1
  return a.localeCompare(b, 'es')
}

export function construirRespuesta(args: {
  actual: DatosPeriodo
  anterior: DatosPeriodo
  carreras: readonly CarreraCatalogo[]
  carreraFiltrada: boolean
  hospitalFiltrado: boolean
  conciliacion: { ok: boolean; totalActual: number | null; totalAnterior: number | null }
  /** Cargos hoy no vigentes sin fecha de pasaje determinable (no entran en ningún período). */
  noVigenteSinFecha: number | null
}): CargosIndicadores {
  const { actual, anterior, carreras } = args
  const aggA = actual.filas ? agregarHojas(actual.filas) : null
  const aggP = anterior.filas ? agregarHojas(anterior.filas) : null
  const pasoA = agregarPasos(actual.pasaron)
  const pasoP = agregarPasos(anterior.pasaron)
  const claves = new Set<string>([
    ...(aggA?.keys() ?? []),
    ...(aggP?.keys() ?? []),
    ...(pasoA?.keys() ?? []),
    ...(pasoP?.keys() ?? []),
  ])
  const porId = new Map(carreras.map((c) => [c.id, c]))
  const porCodigo = new Map(carreras.map((c) => [c.codigo, c.id]))

  const personasPor = (d: DatosPeriodo): Map<string, number> | null => {
    if (args.hospitalFiltrado || !d.personas) return null
    const m = new Map<string, number>()
    for (const p of d.personas) {
      const id = p.codigo === SIN_CODIGO ? '' : porCodigo.get(p.codigo)
      if (id === undefined) continue // código ausente del catálogo: se descarta
      m.set(id, (m.get(id) ?? 0) + p.personas)
    }
    return m
  }
  const perA = actual.filas ? personasPor(actual) : null
  const perP = anterior.filas ? personasPor(anterior) : null

  const armarCeldas = (
    k: string,
    a: HojasConteo | null,
    p: HojasConteo | null,
    esTotal: boolean,
  ): Record<CargosIndicadoresColumnaId, CargosIndicadoresCelda> => {
    const dA = a ? derivarColumnas(a) : null
    const dP = p ? derivarColumnas(p) : null
    const celdas = {} as Record<CargosIndicadoresColumnaId, CargosIndicadoresCelda>
    for (const id of COLUMNAS_TODAS) {
      if (id === 'personas_ref') {
        const val = (m: Map<string, number> | null): number | null => {
          if (!m) return null
          if (esTotal) return args.carreraFiltrada ? [...m.values()].reduce((x, y) => x + y, 0) : null
          return m.get(k) ?? 0
        }
        celdas[id] = celdaNum(val(perA), 0, val(perP), 0)
      } else {
        celdas[id] = celdaDe(dA ? dA[id] : null, dP ? dP[id] : null)
      }
    }
    return celdas
  }

  const filas: CargosIndicadoresFila[] = []
  for (const k of claves) {
    const a = aggA?.get(k) ?? (aggA ? hojasVacias() : null)
    const p = aggP?.get(k) ?? (aggP ? hojasVacias() : null)
    const cat = k === '' ? undefined : porId.get(k)
    const codigo = k === '' ? SIN_CODIGO : (cat?.codigo ?? SIN_CODIGO)
    const literal = cat?.literal ?? null
    filas.push({
      carreraId: k === '' ? null : k,
      codigo,
      literal,
      etiqueta: literal ? `${codigo} — ${literal}` : codigo,
      celdas: armarCeldas(k, a, p, false),
      pasaronNoVigente: celdaPaso(pasoA?.get(k) ?? null, pasoP?.get(k) ?? null, pasoA !== null, pasoP !== null),
    })
  }
  filas.sort((x, y) => {
    if (x.carreraId === null) return 1
    if (y.carreraId === null) return -1
    return ordenarCodigos(x.codigo, y.codigo)
  })

  const sumaTodas = (agg: Map<string, HojasConteo> | null) =>
    agg ? [...agg.values()].reduce(sumarHojas, hojasVacias()) : null
  const totA = sumaTodas(aggA)
  const totP = sumaTodas(aggP)
  const total: CargosIndicadoresFila = {
    carreraId: null,
    codigo: 'Total',
    literal: null,
    etiqueta: 'Total',
    celdas: armarCeldas('', totA, totP, true),
    pasaronNoVigente: celdaPaso(sumaPasos(pasoA), sumaPasos(pasoP), pasoA !== null, pasoP !== null),
  }
  return {
    actual: actual.periodo,
    anterior: anterior.periodo,
    tablas: columnasVisibles(),
    filas,
    total,
    referenciaPersonas: { actualFecha: actual.personasFecha, anteriorFecha: anterior.personasFecha },
    conciliacion: args.conciliacion,
    noVigenteSinFecha: args.noVigenteSinFecha,
  }
}
