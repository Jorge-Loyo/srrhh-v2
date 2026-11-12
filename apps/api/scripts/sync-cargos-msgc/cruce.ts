// ─────────────────────────────────────────────────────────────────────────────
// Motor de cruce Excel MSGC <-> sistema (FASE 1, SOLO LECTURA).
// Función PURA: no toca ninguna base ni el disco. Recibe las filas del Excel, un
// snapshot del sistema ya cargado y devuelve las categorías a–j + el cierre
// aritmético contra el total del Excel.
//
// Particionan las filas del Excel: a, b, c, d, e y las filas de i (rol repetido sin
// explicación / rol en cargo no vigente). Las categorías f, g, h son sobre cargos del
// sistema; j (no resoluble contra catálogos) y el resto de i (colisiones, -TTR-,
// cargo con más de una ocupación viva) son diagnósticos NO excluyentes.
// El `id_sial_rol` se usa como clave de cruce y NUNCA sale en las entradas.
// ─────────────────────────────────────────────────────────────────────────────
import { normalizarTexto } from '@srrhh/normalizacion'
import { concursoCuentaComoActivo } from '../../src/modules/cargos/concursoActivo.regla.js'
import type { FilaNominal } from './leerNominal.js'
import { ACRONIMOS_MSGC, acronimoMsgc, recodificarCodigo } from './acronimoMsgc.js'
import {
  equivalenciaEspecialidad,
  equivalenciaPuesto,
  equivalenciaSigla,
  esSiglaACrear,
  PUESTO_AUXILIAR_ENFERMERIA,
  PUESTO_ENFERMERO_PROFESIONAL,
  reglaPuestoSucio,
} from './equivalencias.js'

// ── Snapshot del sistema ─────────────────────────────────────────────────────
export interface VinculosCargo {
  concursos: number
  concursosCph: number
  concursosCeetps: number
  bajas: number
  padronHistorico: number
  padronIncidencias: number
  etiquetas: number
  solicitudesAlta: number
}

export type EstadoCargoSistema = 'vigente' | 'no_vigente' | 'validacion_vacante'

export interface CargoSistema {
  id: string
  codigo: string | null
  estado: EstadoCargoSistema
  subEstado: string | null
  /** deleted_at no nulo (soft delete). */
  eliminado: boolean
  origen: string
  tipoOrigen: string | null
  expediente: string | null
  codigoRepa: string | null
  sigla: string
  /** Código de registro (carrera) del cargo, si lo tiene. */
  cr: string | null
  escalafon: string
  puesto: string
  especialidad: string | null
  cargoBaseId: string | null
  cargoRetenidoId: string | null
  /** Marca de revision (opcional: un fixture viejo sin estos campos sigue valiendo). */
  revisionDato?: boolean
  revisionMotivo?: string | null
  vinculos: VinculosCargo
}

/**
 * Concurso (CPH o CEETPS) de un cargo del sistema. Sin datos personales: ni persona ni baja.
 * `autorizado` = `concursos.autorizado_at IS NOT NULL`. `expedientes` son los valores crudos
 * (`concursos.expediente`, `expediente_concurso`, `expediente_concurso_2`); se normalizan al cruzar.
 */
export interface ConcursoSistema {
  /** Id del concurso base (`concursos.id`). Opcional: sin el, el plan de escritura no lista ids de concursos. */
  concursoId?: string
  cargoId: string
  tipo: 'cph' | 'ceetps'
  estado: string
  subEstado: string | null
  motivoConcurso: string | null
  autorizado: boolean
  expedientes: (string | null)[]
}

export interface OcupacionViva {
  /**
   * `id_sial_rol` crudo del sistema (`legajo-rol-cuil-rol`; contiene el CUIL). NUNCA se escribe en
   * las salidas. Para cruzar se usa `claveRolSial(idSialRol)`.
   */
  idSialRol: string
  cargoId: string
}

export interface SnapshotSistema {
  cargos: CargoSistema[]
  ocupaciones: OcupacionViva[]
  /** Concursos de los cargos (opcional: un fixture viejo sin concursos sigue valiendo). */
  concursos?: ConcursoSistema[]
  siglasHospital: string[]
  siglasOrganigrama: string[]
  codigosRegistro: { codigo: string; escalafon: string }[]
  puestos: { escalafon: string; nombre: string }[]
  especialidades: string[]
}

export const SNAPSHOT_VACIO: SnapshotSistema = {
  cargos: [],
  ocupaciones: [],
  concursos: [],
  siglasHospital: [],
  siglasOrganigrama: [],
  codigosRegistro: [],
  puestos: [],
  especialidades: [],
}

// ── Resultado ────────────────────────────────────────────────────────────────
export const CATEGORIAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export interface Entrada {
  codigo_excel: string
  categoria: Categoria
  accion: string
  cargo_codigo_sistema: string
  codigo_propuesto: string
  acronimo: string
  cr: string
  sigla: string
  puesto: string
  motivo: string
}

/**
 * Cierre aritmético. La métrica a vigilar es `vigente + validacion_vacante` == filas del Excel
 * (`proyectado_vigente_mas_validacion` vs `total_excel`). "Solo vigente" es un dato secundario.
 */
export interface Cierre {
  vigentes_hoy: number
  validacion_vacante_hoy: number
  /** Cargos nuevos: c + d + filas e sin cargo del sistema para reusar. */
  a_crear: number
  /** De los cargos nuevos, los que el Excel marca "En validacion". */
  a_crear_como_validacion: number
  /** Filas e del Excel que reusan un cargo del sistema (por expediente o por cupo). */
  e_reusadas: number
  e_reusadas_por_expediente: number
  /** Cargos del sistema reusados, por estado de origen. */
  f_reusados: number
  validacion_reusados: number
  /** Cargos del sistema que no tienen fila e donde reusarse: pasan a NO VIGENTE. */
  f_a_no_vigente: number
  validacion_a_no_vigente: number
  g_a_no_vigente: number
  /** Métrica principal. */
  proyectado_vigente_mas_validacion: number
  total_excel: number
  diferencia_vigente_mas_validacion: number
  /** Desglose de la diferencia por categoría (suma = diferencia_vigente_mas_validacion). */
  diferencia_por_categoria: {
    a_b: number
    c: number
    d: number
    e: number
    i_filas: number
    sistema_sin_fila_excel: number
  }
  /** Secundario: solo estado vigente (reusados con el estado del Excel). */
  excel_vigente: number
  excel_en_validacion: number
  proyectado_solo_vigente: number
  diferencia_solo_vigente: number
}

export interface Cupos {
  excel: number
  /** Cargos vigentes sin ocupante del sistema. */
  sistema: number
  /** Cargos validacion_vacante sin ocupante del sistema (también entran al cupo). */
  sistema_validacion: number
  reusados: number
  /** Filas e sin cargo para reusar (se crean). */
  faltan: number
  /** Cargos del sistema sin fila e (pasan a NO VIGENTE). */
  sobran: number
  claves: number
  excel_por_bloque: Record<string, number>
}

/** Un concurso (o vínculo) que queda colgado de un cargo que el plan propone pasar a NO VIGENTE. */
export interface ConcursoColgado {
  cargo_codigo_sistema: string
  estado_cargo: string
  sigla: string
  acronimo_propuesto: string
  puesto: string
  especialidad: string
  /** CPH, CEETPS o 'sin concurso' (el cargo solo tiene otros vínculos). */
  tipo_concurso: string
  estado_concurso: string
  sub_estado_concurso: string
  /** 'si' / 'no' según concursoActivo.regla.ts; 'n/a' si no hay concurso. */
  activo: string
  expediente_concurso: string
  motivo_concurso: string
  autorizado: string
  expediente_en_excel: string
  fila_excel: string
  otros_vinculos: string
  revision: string
}

export interface TotalesColgados {
  filas: number
  cargos: number
  por_tipo: Record<string, number>
  activos: number
  no_activos: number
  por_tipo_activo: Record<string, { activo: number; no_activo: number }>
  revisar: number
}

/**
 * Caso con DOS números de expediente distintos (Excel vs sistema). Jorge elige caso por caso.
 * Solo expedientes normalizados EX-AAAA-NNNNNNNN: ni personas ni roles.
 */
export interface ConflictoExpediente {
  codigo_excel: string
  cargo_codigo_sistema: string
  sigla: string
  puesto: string
  bloque: string
  /** De dónde sale el expediente del sistema: cargo, concurso o cargo y concurso. */
  fuente_sistema: string
  expediente_excel: string
  expediente_sistema: string
}

/**
 * Concurso del Excel (bloque Concurso) SIN numero de expediente: hoy NO se crea concurso (sin numero no se puede
 * reconocer en la corrida siguiente). Jorge los completa en el Excel y en la proxima corrida se crean. Sin datos
 * personales: solo atributos del cargo y el detalle (col. V) del Excel.
 */
export interface ConcursoSinExpediente {
  codigo_excel: string
  sigla: string
  acronimo: string
  cr: string
  literal_puesto: string
  especialidad_cargo: string
  /** Columna V del Excel («detalle»). */
  detalle: string
  /** CPH (CR 37 / 22) o CEETPS (el resto), igual que decide la carga. */
  tipo: 'CPH' | 'CEETPS'
}
/** CPH = codigo de registro 37 o 22; cualquier otro es CEETPS (misma regla que la carga de concursos). */
export const esCrCph = (cr: string | null | undefined) => ['37', '22'].includes(String(cr ?? '').trim().toUpperCase())
/** Acciones de la Fase 2 derivadas de las decisiones del 12-nov (todo SOLO LECTURA: es un plan). */
export interface Fase2Resumen {
  /** Filas por regla de resolución de puestos sucios (CR 87 / CR 85). */
  puestos_resueltos: Record<string, number>
  /** Cargos que se crean/actualizan con revisionDato, por motivo. */
  revision_dato: Record<string, number>
  /** Tipificador "SI" de los concursos CEETPS: se asigna una etiqueta al cargo. */
  etiquetas_ceetps_si: number
  /** "Ampliacion": cargo nuevo con concurso nuevo_cargo sin autorizar (Etapa 1). */
  ampliaciones: number
  jefaturas: {
    /** Jefaturas -J con par (rol repetido): se vinculan al cargo base (cargoBaseId). */
    con_par: number
    base_existe: number
    base_a_crear: number
    /** Jefaturas -J vacantes sin par: vacantes sin cargo base marcadas para revision. */
    vacantes_sin_par: number
  }
  expedientes: { coinciden: number; a_completar: number; conflictos: number }
  concursos: {
    sistema: number
    /** Expediente en el Excel y en el sistema: el concurso se conserva. */
    mantener: number
    /** Se conserva, pero hoy cuelga de un cargo que pasa a no vigente (hay que reasignarlo). */
    mantener_a_reasignar: number
    /** Concursos del sistema que no estan en el Excel: se eliminan. */
    eliminar: number
    eliminar_por_tipo: Record<string, number>
    eliminar_activos: number
    eliminar_nuevo_cargo: number
    eliminar_en_cargo_no_vigente: number
    eliminar_sin_expediente: number
    /** Filas Concurso del Excel CON expediente y sin concurso en el sistema: se crea (caratulado, sin autorizar). */
    crear_desde_excel: number
    /** Filas Concurso del Excel SIN expediente (no ampliacion): NO se crea concurso; se listan en concursos_sin_expediente.csv. */
    sin_expediente_excel: number
    /** Ampliaciones: concurso nuevo_cargo sin autorizar. */
    crear_nuevo_cargo: number
    /** Expediente en 2+ cargos: valido si es de baja/creacion, error si es de concurso. */
    expediente_repetido_valido: number
    expediente_repetido_error: number
  }
}

export interface ResultadoCruce {
  entradas: Record<Categoria, Entrada[]>
  /** Cantidad de entradas por categoría. */
  conteos: Record<Categoria, number>
  /** Filas del Excel que cayen en a+b+c+d+e+(i de fila): debe sumar total_excel. */
  particion: { a: number; b: number; c: number; d: number; e: number; i_filas: number; suma: number }
  cierre: Cierre
  cupos: Cupos
  f_desglose: {
    sin_vinculos: number
    con_vinculos: number
    por_vinculo: Record<keyof VinculosCargo, number>
    vigentes: number
    validacion_vacante: number
  }
  h_desglose: { no_vigente: number; validacion_vacante: number; eliminado: number }
  colisiones: number
  j_por_motivo: Record<string, number>
  concursos_colgados: { filas: ConcursoColgado[]; totales: TotalesColgados }
  fase2: Fase2Resumen
  conflictos_expediente: ConflictoExpediente[]
  /** Concursos del Excel sin expediente (no se crean hasta que Jorge los complete). Ordenados por codigo_excel. */
  concursos_sin_expediente: ConcursoSinExpediente[]
  /** Plan de escritura (FEAT-003). Datos con ids del sistema; el dry-run NO lo escribe. */
  plan: PlanCarga
}

/** Origen con el que la sincronizacion marca los cargos que crea (permite reconocerlos en la corrida siguiente). */
export const ORIGEN_MSGC = 'msgc'
/** Motivo de revision de las ampliaciones creadas (cargo nuevo a caratular, Etapa 1). */
export const MARCA_AMPLIACION = 'Ampliacion MSGC: cargo nuevo a caratular'

/** Un cargo del Excel y lo que hay que hacer con el: reusar/actualizar uno del sistema o crearlo. */
export interface ItemCargo {
  /** Cargo del sistema que se reusa o actualiza; null = se crea. */
  cargoId: string | null
  categoria: 'a' | 'b' | 'c' | 'd' | 'e'
  /** Fila del Excel ya ajustada (puestos sucios resueltos). */
  fila: FilaNominal
  /** Estado destino del cargo. */
  estado: EstadoCargoSistema
  /** Atributos a actualizar en un cargo existente: cr, sigla, puesto, especialidad, estado, base. */
  cambios: string[]
  completarExpediente: boolean
  /** revisionMotivo a dejar (null = no tocar). */
  revision: string | null
  /** Asignar la etiqueta del tipificador CEETPS "SI". */
  etiquetar: boolean
  ampliacion: boolean
  /** Jefatura -J con par (rol repetido). */
  esJefatura: boolean
  /** Clave legajo-rol del grupo (solo c / d). Se usa para vincular jefatura -> base; NUNCA sale en reportes. */
  claveRol: string
  /** Jefatura: cargo base que ya existe en el sistema (null = es el cargo creado/reusado de la fila base). */
  baseCargoId: string | null
  /** Concurso a crear para este cargo. */
  crearConcurso: 'normal' | 'nuevo_cargo' | null
}

export interface PlanCarga {
  items: ItemCargo[]
  /** Cargos del sistema que pasan a NO VIGENTE (ocupados fuera del Excel + vacantes sobrantes). */
  noVigenteIds: string[]
  /** Concursos base que se conservan (su expediente esta en el Excel). */
  concursosConservar: string[]
  /** Concursos base que se eliminan (no estan en el Excel). */
  concursosEliminar: string[]
  /** Concursos que se conservan pero cuelgan de un cargo que pasa a no vigente: se reasignan por expediente. */
  concursosReasignar: { concursoId: string; expediente: string }[]
}

// ── Utilidades ───────────────────────────────────────────────────────────────
/**
 * Clave de cruce del sistema: los DOS primeros segmentos (separados por '-') de
 * `ocupaciones.id_sial_rol`, que en el sistema tiene la forma `legajo-rol-cuil-rol`. Es lo que
 * trae el Excel (columna N) como `legajo-rol`. Se hace trim y no se toca ningun digito (no se
 * quitan ceros a la izquierda). Devuelve null si el valor esta mal formado (menos de dos segmentos
 * o segmentos no numericos); esos casos se reportan en la categoria i.
 */
export function claveRolSial(idSialRol: string | null | undefined): string | null {
  const partes = String(idSialRol ?? '').trim().split('-')
  if (partes.length < 2) return null
  const [legajo, rol] = partes
  if (!/^\d+$/.test(legajo) || !/^\d+$/.test(rol)) return null
  return `${legajo}-${rol}`
}
/** Clave del lado Excel: el valor `legajo-rol` tal cual, solo con trim. */
export const claveRolExcel = (idSialRol: string | null | undefined): string => String(idSialRol ?? '').trim()
const norm = (s: string | null | undefined) => normalizarTexto(s)
const upper = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase()

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Clave normalizada de expediente `EX-AAAA-NNNNNNNN` (numero con ceros a la izquierda hasta 8 digitos).
 * Tolera sufijos (`-GDEBA-...`), espacios y minusculas. Devuelve null si no hay un expediente reconocible.
 */
export function normalizarExpediente(raw: string | null | undefined): string | null {
  const m = /EX[-\s]*(\d{4})[-\s]*(\d+)/i.exec(String(raw ?? ''))
  if (!m) return null
  return `EX-${m[1]}-${m[2].padStart(8, '0')}`
}

const ANULADO_AT = new Date(0)

/** Expedientes normalizados de un concurso del sistema (ordenados, sin repetidos). */
function expedientesDeConcurso(co: ConcursoSistema): string[] {
  const out = new Set<string>()
  for (const x of co.expedientes) {
    const n = normalizarExpediente(x)
    if (n) out.add(n)
  }
  return [...out].sort(cmp)
}

/** Tipificador "SI" de los concursos CEETPS (CR 85 / 87, bloque Concurso): el detalle termina en "/ SI". */
export const esCeetpsSi = (f: FilaNominal) =>
  (f.cr === '85' || f.cr === '87') && normalizarTexto(f.bloque) === 'concurso' && /\/\s*SI\s*$/i.test(f.detalle)
/** "Ampliacion": el detalle del Excel la nombra (cargo nuevo). */
export const esAmpliacion = (f: FilaNominal) => /ampliaci[oó]n/i.test(f.detalle)

function nuevoFase2(): Fase2Resumen {
  return {
    puestos_resueltos: {},
    revision_dato: {},
    etiquetas_ceetps_si: 0,
    ampliaciones: 0,
    jefaturas: { con_par: 0, base_existe: 0, base_a_crear: 0, vacantes_sin_par: 0 },
    expedientes: { coinciden: 0, a_completar: 0, conflictos: 0 },
    concursos: {
      sistema: 0, mantener: 0, mantener_a_reasignar: 0, eliminar: 0, eliminar_por_tipo: {}, eliminar_activos: 0,
      eliminar_nuevo_cargo: 0, eliminar_en_cargo_no_vigente: 0, eliminar_sin_expediente: 0,
      crear_desde_excel: 0, sin_expediente_excel: 0, crear_nuevo_cargo: 0, expediente_repetido_valido: 0, expediente_repetido_error: 0,
    },
  }
}
const ordenar = (o: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).sort(([x], [y]) => cmp(x, y)))
const sumar = (o: Record<string, number>, k: string, n = 1) => {
  o[k] = (o[k] ?? 0) + n
}

interface FilaE {
  /** Ampliacion: cargo nuevo, nunca reusa un cargo del sistema. */
  ampliacion: boolean
  f: FilaNominal
  estadoExcel: EstadoCargoSistema | null
  key: string
  exp: string | null
}

/** Cargo del sistema que puede reusarse para un cupo: vigente sin ocupante o validacion_vacante sin ocupante. */
interface Candidato {
  c: CargoSistema
  key: string
  /** Tiene algun concurso activo segun la regla unica (concursoActivo.regla.ts). */
  activo: boolean
  /** Expedientes normalizados de sus concursos activos. */
  expActivos: Set<string>
  vinc: number
}

type ViaReuso = 'expediente' | 'expediente_otro_cupo' | 'cupo'

const esJefaturaAcronimo = (a: string) => a === 'ENF-J' || a === 'TEC-J' || a === 'EG-J'

function estadoDeExcel(estado: string): EstadoCargoSistema | null {
  const e = norm(estado)
  if (e === 'vigente') return 'vigente'
  if (e === 'en validacion') return 'validacion_vacante'
  return null
}

export function siglaCanonica(raw: string): string {
  return equivalenciaSigla(raw) ?? raw.trim()
}

export function puestoCanonico(cr: string, literal: string): string {
  return equivalenciaPuesto(cr, literal) ?? norm(literal)
}

export function especialidadCanonica(raw: string): string {
  const eq = equivalenciaEspecialidad(raw)
  return norm(eq ?? raw)
}

const sumaVinculos = (v: VinculosCargo) =>
  v.concursos + v.concursosCph + v.concursosCeetps + v.bajas + v.padronHistorico + v.padronIncidencias + v.etiquetas + v.solicitudesAlta

function entradaDeFila(
  f: FilaNominal,
  categoria: Categoria,
  accion: string,
  motivo: string,
  extra: Partial<Pick<Entrada, 'cargo_codigo_sistema' | 'codigo_propuesto'>> = {},
): Entrada {
  return {
    codigo_excel: f.codigo_excel,
    categoria,
    accion,
    cargo_codigo_sistema: extra.cargo_codigo_sistema ?? '',
    codigo_propuesto: extra.codigo_propuesto ?? '',
    acronimo: f.acronimo,
    cr: f.cr,
    sigla: f.sigla,
    puesto: f.literal_puesto,
    motivo,
  }
}

function entradaDeCargo(c: CargoSistema, categoria: Categoria, accion: string, motivo: string, propuesto = ''): Entrada {
  return {
    codigo_excel: '',
    categoria,
    accion,
    cargo_codigo_sistema: c.codigo ?? '',
    codigo_propuesto: propuesto,
    acronimo: '',
    cr: c.cr ?? '',
    sigla: c.sigla,
    puesto: c.puesto,
    motivo,
  }
}

// ── Cruce ────────────────────────────────────────────────────────────────────
export function cruzar(filasEntrada: FilaNominal[], sistema: SnapshotSistema): ResultadoCruce {
  const entradas = Object.fromEntries(CATEGORIAS.map((c) => [c, [] as Entrada[]])) as Record<Categoria, Entrada[]>

  const cargoPorId = new Map(sistema.cargos.map((c) => [c.id, c]))
  const fase2 = nuevoFase2()
  const conflictos: ConflictoExpediente[] = []

  // ── Pre-proceso de las filas (decisiones del 12-nov) ──
  // Puestos sucios de CR 87 / CR 85 y auxiliares de enfermeria. El codigo de registro (CR) NUNCA se toca.
  // Las notas de cada fila (marcas revisionDato, etiqueta, ampliacion) se agregan al motivo de sus entradas.
  const notas = new Map<FilaNominal, string[]>()
  const revisiones = new Map<FilaNominal, string[]>()
  const puestosPorExp = new Map<string, Set<string>>()
  for (const co of sistema.concursos ?? []) {
    const cg = cargoPorId.get(co.cargoId)
    if (!cg) continue
    for (const e of expedientesDeConcurso(co)) {
      const set = puestosPorExp.get(e)
      if (set) set.add(cg.puesto)
      else puestosPorExp.set(e, new Set([cg.puesto]))
    }
  }
  const esJefe = (a: string) => a.endsWith('-J')
  const ajustarFila = (f0: FilaNominal): FilaNominal => {
    let f = f0
    const n: string[] = []
    const rev: string[] = []
    const revisar = (motivo: string) => {
      sumar(fase2.revision_dato, motivo)
      n.push(`revisionDato: ${motivo}`)
      rev.push(motivo)
    }
    const regla = reglaPuestoSucio(f0.cr, f0.literal_puesto)
    const exp = normalizarExpediente(f0.expediente)
    const delConcurso = exp ? [...(puestosPorExp.get(exp) ?? [])].sort(cmp) : []
    const acrEnf = esJefe(f0.acronimo) ? 'ENF-J' : 'ENF'
    if (regla === 'cr87_enfermeria') {
      if (delConcurso.length) {
        f = { ...f, literal_puesto: delConcurso[0], acronimo: acrEnf }
        sumar(fase2.puestos_resueltos, 'cr87_enfermeria_puesto_del_concurso')
        if (delConcurso.length > 1) revisar('CR 87 Enfermeria: el expediente tiene varios puestos en el sistema')
      } else {
        f = { ...f, literal_puesto: PUESTO_ENFERMERO_PROFESIONAL, acronimo: acrEnf }
        sumar(fase2.puestos_resueltos, 'cr87_enfermeria_enfermero_profesional')
        revisar('CR 87 Enfermeria sin concurso en el sistema: Enfermero Profesional a confirmar')
      }
    } else if (regla === 'cr87_tecnico_salud') {
      f = { ...f, literal_puesto: PUESTO_ENFERMERO_PROFESIONAL, acronimo: acrEnf }
      sumar(fase2.puestos_resueltos, 'cr87_tecnico_salud_enfermero_profesional')
    } else if (regla === 'cr85_tecnico') {
      if (delConcurso.length) {
        f = { ...f, literal_puesto: delConcurso[0] }
        sumar(fase2.puestos_resueltos, 'cr85_tecnico_puesto_del_concurso')
        if (delConcurso.length > 1) revisar('CR 85 Tecnico: el expediente tiene varios puestos en el sistema')
      } else {
        sumar(fase2.puestos_resueltos, 'cr85_tecnico_sin_concurso')
        revisar('CR 85 Tecnico sin concurso en el sistema: puesto a revisar')
      }
    } else if (regla === 'cr85_auxiliar') {
      f = { ...f, literal_puesto: PUESTO_AUXILIAR_ENFERMERIA, acronimo: acrEnf }
      sumar(fase2.puestos_resueltos, 'cr85_auxiliar_enfermeria')
    }
    // Todo auxiliar de enfermeria de la CR 85 es ENF (Jorge).
    if (f.cr === '85' && norm(f.literal_puesto) === 'auxiliar de enfermeria' && !f.acronimo.startsWith('ENF')) {
      f = { ...f, acronimo: esJefe(f.acronimo) ? 'ENF-J' : 'ENF' }
      sumar(fase2.puestos_resueltos, 'cr85_auxiliar_acronimo_enf')
    }
    if (esCeetpsSi(f0)) {
      fase2.etiquetas_ceetps_si++
      n.push('etiqueta CEETPS "SI" a asignar al cargo')
    }
    if (f === f0 && n.length === 0) return f0
    if (f === f0) f = { ...f0 }
    notas.set(f, n)
    if (rev.length) revisiones.set(f, rev)
    return f
  }
  const filas = filasEntrada.map(ajustarFila)
  const conNotas = (f: FilaNominal, e: Entrada, extra: string[] = []): Entrada => {
    const t = [...(notas.get(f) ?? []), ...extra]
    if (t.length) e.motivo = `${e.motivo}; ${t.join('; ')}`
    return e
  }
  // Clave legajo-rol -> cargo. Si dos ocupaciones vivas de cargos distintos dan la misma clave no
  // se pisan en silencio: se conserva la del cargoId menor (orden estable) y se reportan en i.
  const ocupPorRol = new Map<string, string>()
  const rolesPorCargo = new Map<string, string[]>()
  const cargosPorClave = new Map<string, Set<string>>()
  const cargosMalFormados = new Set<string>()
  for (const o of [...sistema.ocupaciones].sort((x, y) => cmp(x.cargoId, y.cargoId))) {
    const clave = claveRolSial(o.idSialRol)
    if (clave === null) {
      cargosMalFormados.add(o.cargoId)
      continue
    }
    if (!ocupPorRol.has(clave)) ocupPorRol.set(clave, o.cargoId)
    const cs = cargosPorClave.get(clave)
    if (cs) cs.add(o.cargoId)
    else cargosPorClave.set(clave, new Set([o.cargoId]))
    const l = rolesPorCargo.get(o.cargoId)
    if (l) l.push(clave)
    else rolesPorCargo.set(o.cargoId, [clave])
  }
  const cargosClaveDuplicada = new Set<string>()
  for (const cs of cargosPorClave.values()) if (cs.size > 1) for (const id of cs) cargosClaveDuplicada.add(id)
  const ocupPorCargo = new Map<string, number>()
  for (const o of sistema.ocupaciones) ocupPorCargo.set(o.cargoId, (ocupPorCargo.get(o.cargoId) ?? 0) + 1)

  const escalafonDeCr = new Map(sistema.codigosRegistro.map((c) => [upper(c.codigo), c.escalafon]))
  const puestosCat = new Set(sistema.puestos.map((p) => `${p.escalafon}|${norm(p.nombre)}`))
  const especialidadesCat = new Set(sistema.especialidades.map((e) => norm(e)))
  const siglasHospital = new Set(sistema.siglasHospital.map((s) => norm(s)))
  const siglasOrganigrama = new Set(sistema.siglasOrganigrama.map((s) => norm(s)))

  // Roles del Excel y grupos por rol (para detectar jefaturas y repetidos).
  const grupos = new Map<string, FilaNominal[]>()
  for (const f of filas) {
    const clave = claveRolExcel(f.id_sial_rol)
    if (!clave) continue
    const g = grupos.get(clave)
    if (g) g.push(f)
    else grupos.set(clave, [f])
  }
  const rolesExcel = new Set(grupos.keys())

  // Qué fila del grupo es jefatura (segunda fila del par) y cuáles son ambiguas.
  const filasJefatura = new Set<FilaNominal>()
  const filasRolAmbiguo = new Set<FilaNominal>()
  for (const g of grupos.values()) {
    if (g.length === 1) continue
    const js = g.filter((f) => esJefaturaAcronimo(f.acronimo))
    if (g.length === 2 && js.length === 1) filasJefatura.add(js[0])
    else for (const f of g) filasRolAmbiguo.add(f)
  }

  // Recodificación final de cada cargo (para colisiones): código actual o el propuesto.
  const propuestoPorCargo = new Map<string, string>()
  const cargosCubiertos = new Set<string>()
  const filaDeCargo = new Map<string, FilaNominal>()

  const part = { a: 0, b: 0, c: 0, d: 0, e: 0, i_filas: 0 }
  let aCrearComoValidacion = 0
  const cuposExcel = new Map<string, number>()
  const cuposSistema = new Map<string, number>()
  const filasE: FilaE[] = []
  const candidatos: Candidato[] = []

  // Concursos por cargo y su condicion de activo (regla unica).
  const concursosPorCargo = new Map<string, ConcursoSistema[]>()
  for (const co of sistema.concursos ?? []) {
    const l = concursosPorCargo.get(co.cargoId)
    if (l) l.push(co)
    else concursosPorCargo.set(co.cargoId, [co])
  }
  const concursoActivo = (co: ConcursoSistema) =>
    concursoCuentaComoActivo({
      tipo: co.tipo,
      estado: co.estado,
      motivoConcurso: co.motivoConcurso,
      autorizadoAt: co.autorizado ? ANULADO_AT : null,
    })
  const expedientesDe = expedientesDeConcurso
  // Expedientes (normalizados) de los concursos y del cargo del sistema, para comparar con el del Excel.
  const expedientesDeCargo = (c: CargoSistema): { exps: Set<string>; fuente: string } => {
    const deCargo = normalizarExpediente(c.expediente)
    const deConc = new Set<string>()
    for (const co of concursosPorCargo.get(c.id) ?? []) for (const e of expedientesDe(co)) deConc.add(e)
    const exps = new Set(deConc)
    if (deCargo) exps.add(deCargo)
    return { exps, fuente: deCargo && deConc.size ? 'cargo y concurso' : deCargo ? 'cargo' : 'concurso' }
  }
  /** Compara el expediente del Excel con el del sistema: coincide, se completa o es un conflicto (dos numeros). */
  const compararExpediente = (f: FilaNominal, c: CargoSistema) => {
    const exp = normalizarExpediente(f.expediente)
    if (!exp) return
    const { exps, fuente } = expedientesDeCargo(c)
    if (exps.size === 0) fase2.expedientes.a_completar++
    else if (exps.has(exp)) fase2.expedientes.coinciden++
    else {
      fase2.expedientes.conflictos++
      conflictos.push({
        codigo_excel: f.codigo_excel,
        cargo_codigo_sistema: c.codigo ?? '',
        sigla: c.sigla,
        puesto: c.puesto,
        bloque: f.bloque,
        fuente_sistema: fuente,
        expediente_excel: exp,
        expediente_sistema: [...exps].sort(cmp).join(' | '),
      })
    }
  }
  const nuevoCandidato = (c: CargoSistema): Candidato => {
    const cs = concursosPorCargo.get(c.id) ?? []
    const activos = cs.filter(concursoActivo)
    const expActivos = new Set<string>()
    for (const co of activos) for (const e of expedientesDe(co)) expActivos.add(e)
    const key = claveCupo(c.sigla, sistemaAcronimo(c), c.cr ?? '', c.puesto, c.especialidad ?? '', false)
    cuposSistema.set(key, (cuposSistema.get(key) ?? 0) + 1)
    return { c, key, activo: activos.length > 0, expActivos, vinc: sumaVinculos(c.vinculos) }
  }
  const excelPorBloque: Record<string, number> = {}

  // ── Plan de escritura (FEAT-003) ──
  const itemsPlan: ItemCargo[] = []
  const revisionDe = (f: FilaNominal, extra: string[] = []): string | null => {
    const t = [...(revisiones.get(f) ?? []), ...extra]
    return t.length ? t.join('; ').slice(0, 200) : null
  }
  // Cargos creados por una corrida anterior (origen 'msgc') todavia sin ocupante: las filas c / d / ampliacion
  // los reconocen por cupo en vez de crear otro (idempotencia). En la primera corrida no hay ninguno.
  const tieneNuevoCargo = (id: string) => (concursosPorCargo.get(id) ?? []).some((x) => x.motivoConcurso === 'nuevo_cargo')
  const poolMsgc = new Map<string, CargoSistema[]>()
  for (const c of [...sistema.cargos].sort((x, y) => cmp(x.codigo ?? '', y.codigo ?? '') || cmp(x.id, y.id))) {
    if (c.origen !== ORIGEN_MSGC || c.eliminado || c.estado === 'no_vigente' || (ocupPorCargo.get(c.id) ?? 0) > 0) continue
    const k = claveCupo(c.sigla, sistemaAcronimo(c), c.cr ?? '', c.puesto, c.especialidad ?? '', false)
    const l = poolMsgc.get(k)
    if (l) l.push(c)
    else poolMsgc.set(k, [c])
  }
  const reclamados = new Set<string>()
  const tomarMsgc = (f: FilaNominal, nuevoCargo: boolean): CargoSistema | undefined => {
    const k = claveCupo(f.sigla, f.acronimo, f.cr, f.literal_puesto, f.especialidad_cargo, true)
    const c = (poolMsgc.get(k) ?? []).find((x) => !reclamados.has(x.id) && tieneNuevoCargo(x.id) === nuevoCargo)
    if (c) reclamados.add(c.id)
    return c
  }
  /** Cargo existente cubierto por una fila (a / b, o un cargo 'msgc' reconocido para una fila c / d / ampliacion). */
  const cubrirCargo = (
    f: FilaNominal,
    cargo: CargoSistema,
    estadoExcel: EstadoCargoSistema | null,
    cat: 'c' | 'd' | 'e' | null,
    datos: { claveRol: string; esJefatura: boolean; baseCargoId: string | null; ampliacion: boolean },
  ) => {
    cargosCubiertos.add(cargo.id)
    filaDeCargo.set(cargo.id, f)
    const propuesto = cargo.codigo ? recodificarCodigo(cargo.codigo, f.acronimo) : null
    if (propuesto) propuestoPorCargo.set(cargo.id, propuesto)
    compararExpediente(f, cargo)
    const difs = diferencias(f, cargo, propuesto, estadoExcel, escalafonDeCr)
    const ocupado = (ocupPorCargo.get(cargo.id) ?? 0) > 0
    // El estado de un cargo ocupado lo manda el sistema; el acronimo lo resuelve la recodificacion.
    const cambios = difs.filter((d) => !d.startsWith('acronimo') && !(ocupado && d === 'estado'))
    if (datos.esJefatura && datos.baseCargoId !== null && cargo.cargoBaseId !== datos.baseCargoId) cambios.push('base')
    if (difs.length === 0) {
      part.a++
      entradas.a.push(conNotas(f, entradaDeFila(f, 'a', 'ninguna', 'sin diferencias', { cargo_codigo_sistema: cargo.codigo ?? '' })))
    } else {
      part.b++
      entradas.b.push(
        conNotas(f, entradaDeFila(f, 'b', 'actualizar atributos', `difiere: ${difs.join(', ')}`, {
          cargo_codigo_sistema: cargo.codigo ?? '',
          codigo_propuesto: propuesto && propuesto !== cargo.codigo ? propuesto : '',
        })),
      )
    }
    const revision = datos.ampliacion ? MARCA_AMPLIACION : revisionDe(f)
    itemsPlan.push({
      cargoId: cargo.id,
      categoria: cat ?? (difs.length === 0 ? 'a' : 'b'),
      fila: f,
      estado: estadoExcel ?? cargo.estado,
      cambios,
      completarExpediente: Boolean(normalizarExpediente(f.expediente)) && expedientesDeCargo(cargo).exps.size === 0,
      revision: revision !== null && revision !== (cargo.revisionMotivo ?? null) ? revision : null,
      etiquetar: esCeetpsSi(f) && cargo.vinculos.etiquetas === 0,
      ampliacion: datos.ampliacion,
      esJefatura: datos.esJefatura,
      claveRol: datos.claveRol,
      baseCargoId: datos.baseCargoId,
      crearConcurso: null,
    })
  }

  for (const f of filas) {
    const estadoExcel = estadoDeExcel(f.estado)

    // j: no resoluble contra catálogos (no excluyente).
    const motivosJ = motivosNoResolubles(f)
    if (motivosJ.length) {
      entradas.j.push(entradaDeFila(f, 'j', 'sin accion', motivosJ.join('; ')))
    }

    // e: sin ocupante.
    const claveFila = claveRolExcel(f.id_sial_rol)
    if (!claveFila) {
      if (esAmpliacion(f)) {
        const m = tomarMsgc(f, true)
        if (m) {
          cubrirCargo(f, m, estadoExcel, 'e', { claveRol: '', esJefatura: false, baseCargoId: null, ampliacion: true })
          continue
        }
      }
      part.e++
      const bloque = f.bloque || 'sin bloque'
      excelPorBloque[bloque] = (excelPorBloque[bloque] ?? 0) + 1
      const k = claveCupo(f.sigla, f.acronimo, f.cr, f.literal_puesto, f.especialidad_cargo, true)
      cuposExcel.set(k, (cuposExcel.get(k) ?? 0) + 1)
      filasE.push({ f, estadoExcel, key: k, exp: normalizarExpediente(f.expediente), ampliacion: esAmpliacion(f) })
      continue
    }

    // i: rol repetido sin explicación de jefatura.
    if (filasRolAmbiguo.has(f)) {
      part.i_filas++
      entradas.i.push(conNotas(f, entradaDeFila(f, 'i', 'sin accion', 'ID SIAL Rol repetido sin explicacion de jefatura')))
      continue
    }

    // d: jefatura = segunda fila del par.
    if (filasJefatura.has(f)) {
      const baseExistenteId = ocupPorRol.get(claveFila) ?? null
      const reconocido = tomarMsgc(f, false)
      if (reconocido) {
        cubrirCargo(f, reconocido, estadoExcel, 'd', { claveRol: claveFila, esJefatura: true, baseCargoId: baseExistenteId, ampliacion: false })
        continue
      }
      part.d++
      if (estadoExcel === 'validacion_vacante') aCrearComoValidacion++
      const base = (grupos.get(claveFila) ?? []).find((x) => x !== f)
      const cargoBaseId = ocupPorRol.get(claveFila)
      const cargoBase = cargoBaseId ? cargoPorId.get(cargoBaseId) : undefined
      fase2.jefaturas.con_par++
      if (cargoBase) fase2.jefaturas.base_existe++
      else fase2.jefaturas.base_a_crear++
      const motivo = cargoBase
        ? `cargo base existe en el sistema (${cargoBase.codigo ?? 'sin codigo'}); base Excel ${base?.codigo_excel ?? '?'}; se vincula con cargoBaseId`
        : `cargo base NO existe en el sistema; base Excel ${base?.codigo_excel ?? '?'} (se crea como c); se vincula con cargoBaseId`
      entradas.d.push(conNotas(f, entradaDeFila(f, 'd', 'crear jefatura vinculada al cargo base', motivo)))
      itemsPlan.push({
        cargoId: null, categoria: 'd', fila: f, estado: estadoExcel ?? 'vigente', cambios: [], completarExpediente: false,
        revision: revisionDe(f), etiquetar: esCeetpsSi(f), ampliacion: false, esJefatura: true, claveRol: claveFila,
        baseCargoId: cargoBase?.id ?? null, crearConcurso: null,
      })
      continue
    }

    // c / i / a / b: cruce por ID SIAL Rol.
    const cargoId = ocupPorRol.get(claveFila)
    if (!cargoId) {
      const reconocido = tomarMsgc(f, false)
      if (reconocido) {
        cubrirCargo(f, reconocido, estadoExcel, 'c', { claveRol: claveFila, esJefatura: false, baseCargoId: null, ampliacion: false })
        continue
      }
      part.c++
      if (estadoExcel === 'validacion_vacante') aCrearComoValidacion++
      entradas.c.push(conNotas(f, entradaDeFila(f, 'c', 'crear cargo', 'ID SIAL Rol sin ocupacion viva en el sistema')))
      itemsPlan.push({
        cargoId: null, categoria: 'c', fila: f, estado: estadoExcel ?? 'vigente', cambios: [], completarExpediente: false,
        revision: revisionDe(f), etiquetar: esCeetpsSi(f), ampliacion: false, esJefatura: false, claveRol: claveFila,
        baseCargoId: null, crearConcurso: null,
      })
      continue
    }
    const cargo = cargoPorId.get(cargoId)
    if (!cargo || cargo.estado !== 'vigente' || cargo.eliminado) {
      part.i_filas++
      entradas.i.push(
        entradaDeFila(f, 'i', 'sin accion', `rol apunta a cargo no vigente (${cargo?.estado ?? 'inexistente'}${cargo?.eliminado ? ', eliminado' : ''})`, {
          cargo_codigo_sistema: cargo?.codigo ?? '',
        }),
      )
      continue
    }

    cubrirCargo(f, cargo, estadoExcel, null, { claveRol: claveFila, esJefatura: false, baseCargoId: null, ampliacion: false })
  }

  // Cargos del sistema: candidatos al cupo (vigentes sin ocupante y validacion_vacante sin ocupante), g, h, i (cargo).
  let g = 0
  const gIds = new Set<string>()
  let vigentesHoy = 0
  let validacionHoy = 0
  const h = { no_vigente: 0, validacion_vacante: 0, eliminado: 0 }

  for (const c of sistema.cargos) {
    if (cargosMalFormados.has(c.id)) {
      entradas.i.push(entradaDeCargo(c, 'i', 'sin accion', 'ocupacion viva con id_sial_rol mal formado (no se puede derivar legajo-rol)'))
    }
    if (cargosClaveDuplicada.has(c.id)) {
      entradas.i.push(entradaDeCargo(c, 'i', 'sin accion', 'ocupacion viva con la misma clave legajo-rol que otro cargo (distinto CUIL)'))
    }
    // -TTR-: sin regla de recodificación (no se inventa).
    if (c.tipoOrigen === 'TTR' || (c.codigo ?? '').includes('-TTR-')) {
      entradas.i.push(entradaDeCargo(c, 'i', 'sin accion', 'cargo -TTR-: sin regla de recodificacion'))
    }
    if (reclamados.has(c.id)) {
      // Cargo 'msgc' de una corrida anterior reconocido por una fila c / d / ampliacion: ya esta cubierto.
      if (c.estado === 'vigente') vigentesHoy++
      else validacionHoy++
      continue
    }
    if (c.eliminado || c.estado !== 'vigente') {
      if (!c.eliminado && c.estado === 'validacion_vacante' && (ocupPorCargo.get(c.id) ?? 0) === 0) {
        // validacion_vacante sin ocupante: entra al cruce por cupo junto con las vacantes vigentes.
        validacionHoy++
        candidatos.push(nuevoCandidato(c))
        continue
      }
      if (c.eliminado) h.eliminado++
      else if (c.estado === 'no_vigente') h.no_vigente++
      else if (c.estado === 'validacion_vacante') h.validacion_vacante++
      if (c.eliminado) {
        entradas.h.push(entradaDeCargo(c, 'h', 'informativo', `eliminado (deleted_at); estado ${c.estado}`))
      } else {
        entradas.h.push(entradaDeCargo(c, 'h', 'informativo', c.estado === 'validacion_vacante' ? 'validacion_vacante con ocupacion viva (se cuenta aparte)' : 'ya no vigente'))
        if (c.estado === 'validacion_vacante') validacionHoy++
      }
      continue
    }
    vigentesHoy++
    const nOcup = ocupPorCargo.get(c.id) ?? 0
    if (nOcup > 1) {
      entradas.i.push(entradaDeCargo(c, 'i', 'sin accion', `cargo con ${nOcup} ocupaciones vivas`))
    }
    if (nOcup === 0) {
      candidatos.push(nuevoCandidato(c))
      continue
    }
    const roles = rolesPorCargo.get(c.id) ?? []
    if (!roles.some((r) => rolesExcel.has(r))) {
      g++
      gIds.add(c.id)
      entradas.g.push(entradaDeCargo(c, 'g', 'pasar a no_vigente', 'ocupante vivo cuyo ID SIAL Rol no esta en el Excel'))
    }
  }

  // ── Reuso por cupo ──
  // Las filas e del Excel se emparejan con los candidatos (vigentes sin ocupante + validacion_vacante sin
  // ocupante). Orden de preferencia (ver README, "Orden de preferencia al reusar"):
  //   1) expediente: concurso ACTIVO del cargo cuyo expediente coincide con el de la fila (prioridad sobre el cupo);
  //   2) misma clave de cupo (sigla|acronimo|puesto|especialidad), eligiendo dentro de la clave:
  //      a) bloque "Concurso": primero cargos con concurso activo; resto de bloques: primero los SIN concurso activo,
  //      b) cargo cuyo estado ya coincide con el estado del Excel (sin transicion),
  //      c) mas vinculos (bajas, concursos, solicitudes: evita dejarlos colgados), d) codigo.
  filasE.sort((x, y) => cmp(x.f.codigo_excel, y.f.codigo_excel) || cmp(x.key, y.key))
  candidatos.sort((x, y) => cmp(x.c.codigo ?? '', y.c.codigo ?? '') || cmp(x.c.id, y.c.id))
  const destinoDe = (r: FilaE): EstadoCargoSistema => r.estadoExcel ?? 'vigente'
  const esConcurso = (r: FilaE) => norm(r.f.bloque) === 'concurso'
  const asignacion = new Map<FilaE, { cand: Candidato; via: ViaReuso }>()
  const candAsignado = new Set<Candidato>()
  const asignar = (r: FilaE, cand: Candidato, via: ViaReuso) => {
    asignacion.set(r, { cand, via })
    candAsignado.add(cand)
  }
  const mejor = (r: FilaE, lista: Candidato[]): Candidato | undefined => {
    let best: Candidato | undefined
    let bestK: [number, number, number] = [0, 0, 0]
    for (const cand of lista) {
      if (candAsignado.has(cand)) continue
      const k: [number, number, number] = [
        esConcurso(r) ? (cand.activo ? 0 : 1) : cand.activo ? 1 : 0,
        cand.c.estado === destinoDe(r) ? 0 : 1,
        -cand.vinc,
      ]
      if (!best || k[0] < bestK[0] || (k[0] === bestK[0] && (k[1] < bestK[1] || (k[1] === bestK[1] && k[2] < bestK[2])))) {
        best = cand
        bestK = k
      }
    }
    return best
  }
  // 1) Expediente.
  const rowsPorExp = new Map<string, FilaE[]>()
  for (const r of filasE) {
    if (!r.exp || r.ampliacion) continue
    const l = rowsPorExp.get(r.exp)
    if (l) l.push(r)
    else rowsPorExp.set(r.exp, [r])
  }
  const candsPorExp = new Map<string, Candidato[]>()
  for (const cand of candidatos) {
    for (const e of [...cand.expActivos].sort(cmp)) {
      const l = candsPorExp.get(e)
      if (l) l.push(cand)
      else candsPorExp.set(e, [cand])
    }
  }
  for (const exp of [...rowsPorExp.keys()].sort(cmp)) {
    const cands = candsPorExp.get(exp)
    if (!cands) continue
    const rows = rowsPorExp.get(exp) ?? []
    for (const r of rows) {
      const m = mejor(r, cands.filter((x) => x.key === r.key))
      if (m) asignar(r, m, 'expediente')
    }
    const rowsLibres = rows.filter((r) => !asignacion.has(r))
    const candsLibres = cands.filter((x) => !candAsignado.has(x))
    // Cupo distinto: solo si queda exactamente una fila y un cargo para ese expediente (1 a 1, sin ambiguedad).
    if (rowsLibres.length === 1 && candsLibres.length === 1) asignar(rowsLibres[0], candsLibres[0], 'expediente_otro_cupo')
  }
  // 2) Cupo. Las filas del bloque Concurso eligen primero (necesitan los cargos con concurso activo).
  const candsPorClave = new Map<string, Candidato[]>()
  for (const cand of candidatos) {
    const l = candsPorClave.get(cand.key)
    if (l) l.push(cand)
    else candsPorClave.set(cand.key, [cand])
  }
  const orden = filasE
    .filter((r) => !asignacion.has(r) && !r.ampliacion)
    .sort((x, y) => Number(esConcurso(y)) - Number(esConcurso(x)) || cmp(x.f.codigo_excel, y.f.codigo_excel))
  for (const r of orden) {
    const m = mejor(r, candsPorClave.get(r.key) ?? [])
    if (m) asignar(r, m, 'cupo')
  }

  // Salidas e (filas del Excel sin ocupante) y f (candidatos del sistema).
  const textoVia: Record<ViaReuso, string> = {
    expediente: 'por expediente del concurso activo',
    expediente_otro_cupo: 'por expediente del concurso activo (el cupo difiere: se actualizan los atributos)',
    cupo: 'por cupo',
  }
  const transicion = (c: CargoSistema, destino: EstadoCargoSistema) =>
    c.estado === destino ? `estado ${c.estado} (sin cambio)` : `transicion de estado ${c.estado} -> ${destino}`
  const fPorVinculo = { concursos: 0, concursosCph: 0, concursosCeetps: 0, bajas: 0, padronHistorico: 0, padronIncidencias: 0, etiquetas: 0, solicitudesAlta: 0 }
  let fSin = 0
  let fCon = 0
  let aCrearComoValidacionE = 0
  const reusadoPor = new Map<Candidato, FilaE>()
  for (const [r, a] of asignacion) reusadoPor.set(a.cand, r)
  // Concursos: solo deben quedar los del Excel (cruce por expediente normalizado).
  const expConcursoExcel = new Set<string>()
  for (const r of filasE) if (esConcurso(r) && !r.ampliacion && r.exp) expConcursoExcel.add(r.exp)
  const expConcursoSistema = new Set<string>()
  for (const co of sistema.concursos ?? []) for (const e of expedientesDe(co)) expConcursoSistema.add(e)
  const concursosSinExpediente: ConcursoSinExpediente[] = []
  for (const r of filasE) {
    const bloque = r.f.bloque || 'sin bloque'
    const a = asignacion.get(r)
    const extra: string[] = []
    if (esJefaturaAcronimo(r.f.acronimo)) {
      fase2.jefaturas.vacantes_sin_par++
      sumar(fase2.revision_dato, 'jefatura vacante sin par: sin cargo base')
      extra.push('jefatura vacante sin par: sin cargo base (se crea al designar), revisionDato')
    }
    if (r.ampliacion) {
      fase2.ampliaciones++
      fase2.concursos.crear_nuevo_cargo++
      extra.push('ampliacion: cargo nuevo con concurso nuevo_cargo sin autorizar (Etapa 1, Nuevos cargos)')
    } else if (esConcurso(r)) {
      if (!r.exp) {
        // Sin numero de expediente no se crea concurso (no se podria reconocer la semana siguiente): se lista.
        fase2.concursos.sin_expediente_excel++
        concursosSinExpediente.push({
          codigo_excel: r.f.codigo_excel, sigla: r.f.sigla, acronimo: r.f.acronimo, cr: r.f.cr,
          literal_puesto: r.f.literal_puesto, especialidad_cargo: r.f.especialidad_cargo, detalle: r.f.detalle,
          tipo: esCrCph(r.f.cr) ? 'CPH' : 'CEETPS',
        })
        extra.push('concurso del Excel sin expediente: no se crea concurso (ver concursos_sin_expediente.csv)')
      } else if (expConcursoSistema.has(r.exp)) extra.push('concurso del sistema se mantiene (expediente en ambos)')
      else {
        fase2.concursos.crear_desde_excel++
        extra.push('concurso a crear: caratulado, sin autorizar, detalle en observaciones')
      }
    }
    const crearConcurso: ItemCargo['crearConcurso'] = r.ampliacion
      ? 'nuevo_cargo'
      : esConcurso(r) && r.exp && !expConcursoSistema.has(r.exp)
        ? 'normal'
        : null
    const base: Omit<ItemCargo, 'cargoId' | 'cambios' | 'completarExpediente' | 'revision' | 'etiquetar'> = {
      categoria: 'e', fila: r.f, estado: destinoDe(r), ampliacion: r.ampliacion,
      esJefatura: false, claveRol: '', baseCargoId: null, crearConcurso,
    }
    const revisionFila = r.ampliacion ? MARCA_AMPLIACION : revisionDe(r.f, esJefaturaAcronimo(r.f.acronimo) ? ['Jefatura vacante sin par: sin cargo base'] : [])
    if (a) {
      const cg = a.cand.c
      const difs = diferencias(r.f, cg, null, r.estadoExcel, escalafonDeCr).filter((d) => !d.startsWith('acronimo'))
      itemsPlan.push({
        ...base, cargoId: cg.id, cambios: difs,
        completarExpediente: Boolean(r.exp) && expedientesDeCargo(cg).exps.size === 0,
        revision: revisionFila !== null && revisionFila !== (cg.revisionMotivo ?? null) ? revisionFila : null,
        etiquetar: esCeetpsSi(r.f) && cg.vinculos.etiquetas === 0,
      })
    } else {
      itemsPlan.push({ ...base, cargoId: null, cambios: [], completarExpediente: false, revision: revisionFila, etiquetar: esCeetpsSi(r.f) })
    }
    if (a) {
      compararExpediente(r.f, a.cand.c)
      entradas.e.push(
        conNotas(r.f, entradaDeFila(r.f, 'e', 'reusar cargo del sistema', `bloque ${bloque}; estado Excel ${r.f.estado}; reusa ${textoVia[a.via]}; ${transicion(a.cand.c, destinoDe(r))}`, {
          cargo_codigo_sistema: a.cand.c.codigo ?? '',
        }), extra),
      )
    } else {
      if (r.estadoExcel === 'validacion_vacante') aCrearComoValidacionE++
      entradas.e.push(conNotas(r.f, entradaDeFila(r.f, 'e', 'crear cupo', `bloque ${bloque}; estado ${r.f.estado}`), extra))
    }
  }
  let fReusVig = 0
  let fReusVal = 0
  let fSobVig = 0
  let fSobVal = 0
  let deltaSoloVigente = 0
  const sobrantes: Candidato[] = []
  for (const cand of candidatos) {
    const c = cand.c
    const v = cand.vinc
    if (v === 0) fSin++
    else fCon++
    for (const k of Object.keys(fPorVinculo) as (keyof VinculosCargo)[]) if (c.vinculos[k] > 0) fPorVinculo[k]++
    const r = reusadoPor.get(cand)
    const vincTxt = v === 0 ? 'sin vinculos' : `con vinculos (${descVinculos(c.vinculos)})`
    const origen = c.estado === 'validacion_vacante' ? 'validacion_vacante' : 'vacante vigente'
    if (r) {
      const destino = destinoDe(r)
      if (c.estado === 'vigente') fReusVig++
      else fReusVal++
      if (c.estado === 'vigente' && destino !== 'vigente') deltaSoloVigente--
      if (c.estado !== 'vigente' && destino === 'vigente') deltaSoloVigente++
      const e = entradaDeCargo(c, 'f', 'reusar para cupo del Excel', `${origen}; reusa fila ${r.f.codigo_excel} ${textoVia[asignacion.get(r)!.via]}; ${transicion(c, destino)}; ${vincTxt}`)
      e.codigo_excel = r.f.codigo_excel
      entradas.f.push(e)
    } else {
      if (c.estado === 'vigente') fSobVig++
      else fSobVal++
      sobrantes.push(cand)
      entradas.f.push(entradaDeCargo(c, 'f', 'pasar a no_vigente', `${origen}; sobrante de cupo (sin fila sin ocupante equivalente en el Excel); ${vincTxt}`))
    }
  }

  // Concursos del sistema: se conservan los del Excel; el resto se elimina (Jorge, 12-nov).
  const noVigenteIds = new Set<string>([...gIds, ...sobrantes.map((x) => x.c.id)])
  const concursosConservar = new Set<string>()
  const concursosEliminar = new Set<string>()
  const concursosReasignar: { concursoId: string; expediente: string }[] = []
  for (const co of sistema.concursos ?? []) {
    const k = fase2.concursos
    k.sistema++
    const exps = expedientesDe(co)
    if (exps.some((e) => expConcursoExcel.has(e))) {
      if (noVigenteIds.has(co.cargoId)) {
        k.mantener_a_reasignar++
        if (co.concursoId) concursosReasignar.push({ concursoId: co.concursoId, expediente: exps.find((e) => expConcursoExcel.has(e)) as string })
      } else k.mantener++
      if (co.concursoId) concursosConservar.add(co.concursoId)
      continue
    }
    if (co.concursoId) concursosEliminar.add(co.concursoId)
    k.eliminar++
    sumar(k.eliminar_por_tipo, co.tipo === 'cph' ? 'CPH' : 'CEETPS')
    if (concursoActivo(co)) k.eliminar_activos++
    if (co.motivoConcurso === 'nuevo_cargo') k.eliminar_nuevo_cargo++
    if (noVigenteIds.has(co.cargoId)) k.eliminar_en_cargo_no_vigente++
    if (exps.length === 0) k.eliminar_sin_expediente++
  }
  // Expediente repetido en 2+ cargos del Excel: valido si es de baja/creacion; error si es de concurso.
  const filasPorExp = new Map<string, FilaNominal[]>()
  for (const f of filas) {
    const e = normalizarExpediente(f.expediente)
    if (!e) continue
    const l = filasPorExp.get(e)
    if (l) l.push(f)
    else filasPorExp.set(e, [f])
  }
  for (const exp of [...filasPorExp.keys()].sort(cmp)) {
    const grupo = filasPorExp.get(exp) ?? []
    if (grupo.length < 2) continue
    const deConcurso = grupo.filter((f) => norm(f.bloque) === 'concurso' && !esAmpliacion(f))
    if (deConcurso.length >= 2) {
      fase2.concursos.expediente_repetido_error++
      for (const f of deConcurso) {
        entradas.i.push(entradaDeFila(f, 'i', 'sin accion', `expediente de concurso repetido en ${deConcurso.length} cargos del Excel (error: un concurso no puede estar en 2 cargos)`))
      }
    } else fase2.concursos.expediente_repetido_valido++
  }

  // Colisiones de recodificación sobre cargos.codigo (@unique, incluye eliminados).
  const colisiones = detectarColisiones(sistema.cargos, propuestoPorCargo, filaDeCargo)
  for (const e of colisiones) entradas.i.push(e)

  // Cupos (por asignacion real: incluye los reusos por expediente de otro cupo).
  const reusados = asignacion.size
  const claves = new Set([...cuposExcel.keys(), ...cuposSistema.keys()])
  const cupos: Cupos = {
    excel: part.e,
    sistema: fReusVig + fSobVig,
    sistema_validacion: fReusVal + fSobVal,
    reusados,
    faltan: part.e - reusados,
    sobran: candidatos.length - reusados,
    claves: claves.size,
    excel_por_bloque: Object.fromEntries(Object.entries(excelPorBloque).sort(([x], [y]) => cmp(x, y))),
  }

  // Concursos (y otros vinculos) que quedan colgados de cargos que pasan a NO VIGENTE.
  const colgados = concursosColgados(sobrantes, filas)

  // Orden estable.
  for (const cat of CATEGORIAS) {
    entradas[cat].sort(
      (x, y) =>
        cmp(x.codigo_excel, y.codigo_excel) ||
        cmp(x.cargo_codigo_sistema, y.cargo_codigo_sistema) ||
        cmp(x.motivo, y.motivo),
    )
  }

  const eNuevos = part.e - reusados
  const aCrear = part.c + part.d + eNuevos
  const aCrearComoValidacionTotal = aCrearComoValidacion + aCrearComoValidacionE
  const totalExcel = filas.length
  const excelVigente = filas.filter((f) => estadoDeExcel(f.estado) === 'vigente').length
  const excelValidacion = filas.filter((f) => estadoDeExcel(f.estado) === 'validacion_vacante').length
  // Métrica principal: vigente + validacion_vacante.
  const proyectadoMas = vigentesHoy + validacionHoy + aCrear - fSobVig - fSobVal - g
  // Secundario: solo vigente (los reusados quedan con el estado del Excel).
  const proyectadoSolo = vigentesHoy - g - fSobVig + (aCrear - aCrearComoValidacionTotal) + deltaSoloVigente
  const cierre: Cierre = {
    vigentes_hoy: vigentesHoy,
    validacion_vacante_hoy: validacionHoy,
    a_crear: aCrear,
    a_crear_como_validacion: aCrearComoValidacionTotal,
    e_reusadas: reusados,
    e_reusadas_por_expediente: [...asignacion.values()].filter((x) => x.via !== 'cupo').length,
    f_reusados: fReusVig,
    validacion_reusados: fReusVal,
    f_a_no_vigente: fSobVig,
    validacion_a_no_vigente: fSobVal,
    g_a_no_vigente: g,
    proyectado_vigente_mas_validacion: proyectadoMas,
    total_excel: totalExcel,
    diferencia_vigente_mas_validacion: proyectadoMas - totalExcel,
    diferencia_por_categoria: {
      a_b: cargosCubiertos.size - (part.a + part.b),
      c: 0,
      d: 0,
      e: reusados + eNuevos - part.e,
      i_filas: -part.i_filas,
      sistema_sin_fila_excel: proyectadoMas - cargosCubiertos.size - part.c - part.d - part.e,
    },
    excel_vigente: excelVigente,
    excel_en_validacion: excelValidacion,
    proyectado_solo_vigente: proyectadoSolo,
    diferencia_solo_vigente: proyectadoSolo - excelVigente,
  }

  const jPorMotivo: Record<string, number> = {}
  for (const e of entradas.j) {
    for (const m of e.motivo.split('; ')) {
      const clave = m.replace(/\s*\(.*\)$/, '')
      jPorMotivo[clave] = (jPorMotivo[clave] ?? 0) + 1
    }
  }

  const conteos = Object.fromEntries(CATEGORIAS.map((c) => [c, entradas[c].length])) as Record<Categoria, number>
  return {
    entradas,
    conteos,
    particion: { ...part, suma: part.a + part.b + part.c + part.d + part.e + part.i_filas },
    cierre,
    cupos,
    f_desglose: {
      sin_vinculos: fSin,
      con_vinculos: fCon,
      por_vinculo: fPorVinculo,
      vigentes: fReusVig + fSobVig,
      validacion_vacante: fReusVal + fSobVal,
    },
    h_desglose: h,
    colisiones: colisiones.length,
    j_por_motivo: Object.fromEntries(Object.entries(jPorMotivo).sort(([x], [y]) => cmp(x, y))),
    concursos_colgados: colgados,
    fase2: {
      ...fase2,
      puestos_resueltos: ordenar(fase2.puestos_resueltos),
      revision_dato: ordenar(fase2.revision_dato),
      concursos: { ...fase2.concursos, eliminar_por_tipo: ordenar(fase2.concursos.eliminar_por_tipo) },
    },
    conflictos_expediente: conflictos.sort(
      (x, y) => cmp(x.codigo_excel, y.codigo_excel) || cmp(x.cargo_codigo_sistema, y.cargo_codigo_sistema),
    ),
    concursos_sin_expediente: concursosSinExpediente.sort((x, y) => cmp(x.codigo_excel, y.codigo_excel)),
    plan: {
      items: [...itemsPlan].sort((x, y) => cmp(x.fila.codigo_excel, y.fila.codigo_excel) || cmp(x.cargoId ?? '', y.cargoId ?? '')),
      noVigenteIds: [...noVigenteIds].sort(cmp),
      concursosConservar: [...concursosConservar].sort(cmp),
      concursosEliminar: [...concursosEliminar].sort(cmp),
      concursosReasignar: [...concursosReasignar].sort((x, y) => cmp(x.concursoId, y.concursoId)),
    },
  }

  // ── Helpers con acceso al snapshot ──
  function concursosColgados(sobr: Candidato[], todas: FilaNominal[]): { filas: ConcursoColgado[]; totales: TotalesColgados } {
    const expExcel = new Map<string, Set<string>>()
    for (const f of todas) {
      const e = normalizarExpediente(f.expediente)
      if (!e) continue
      const set = expExcel.get(e)
      if (set) set.add(f.codigo_excel)
      else expExcel.set(e, new Set([f.codigo_excel]))
    }
    const filasOut: ConcursoColgado[] = []
    for (const cand of sobr) {
      const c = cand.c
      const cs = concursosPorCargo.get(c.id) ?? []
      const v = c.vinculos
      const otros = descVinculos({ ...v, concursos: 0, concursosCph: 0, concursosCeetps: 0 })
      if (cs.length === 0 && !(sumaVinculos(v) > 0)) continue
      const base = {
        cargo_codigo_sistema: c.codigo ?? '',
        estado_cargo: c.estado,
        sigla: c.sigla,
        acronimo_propuesto: sistemaAcronimo(c),
        puesto: c.puesto,
        especialidad: c.especialidad ?? '',
        otros_vinculos: otros,
      }
      if (cs.length === 0) {
        filasOut.push({
          ...base, tipo_concurso: 'sin concurso', estado_concurso: '', sub_estado_concurso: '', activo: 'n/a',
          expediente_concurso: '', motivo_concurso: '', autorizado: 'n/a', expediente_en_excel: 'no', fila_excel: '', revision: '',
        })
        continue
      }
      for (const co of cs) {
        const activo = concursoActivo(co)
        const exps = expedientesDe(co)
        const enExcel = exps.filter((e) => expExcel.has(e))
        const filasExcel = [...new Set(enExcel.flatMap((e) => [...(expExcel.get(e) ?? [])]))].sort(cmp)
        const filaTxt = filasExcel.length > 5 ? `${filasExcel.slice(0, 5).join(' | ')} | +${filasExcel.length - 5}` : filasExcel.join(' | ')
        filasOut.push({
          ...base,
          tipo_concurso: co.tipo === 'cph' ? 'CPH' : 'CEETPS',
          estado_concurso: co.estado,
          sub_estado_concurso: co.subEstado ?? '',
          activo: activo ? 'si' : 'no',
          expediente_concurso: exps.join(' | '),
          motivo_concurso: co.motivoConcurso ?? '',
          autorizado: co.autorizado ? 'si' : 'no',
          expediente_en_excel: enExcel.length ? 'si' : 'no',
          fila_excel: filaTxt,
          revision: activo && enExcel.length ? 'revisar: el Excel tiene este expediente en otra fila' : '',
        })
      }
    }
    filasOut.sort((x, y) => cmp(x.cargo_codigo_sistema, y.cargo_codigo_sistema) || cmp(x.tipo_concurso, y.tipo_concurso) || cmp(x.expediente_concurso, y.expediente_concurso) || cmp(x.estado_concurso, y.estado_concurso))
    const totales: TotalesColgados = {
      filas: filasOut.length,
      cargos: new Set(filasOut.map((x) => x.cargo_codigo_sistema)).size,
      por_tipo: {},
      activos: 0,
      no_activos: 0,
      por_tipo_activo: {},
      revisar: 0,
    }
    for (const x of filasOut) {
      totales.por_tipo[x.tipo_concurso] = (totales.por_tipo[x.tipo_concurso] ?? 0) + 1
      if (x.revision) totales.revisar++
      if (x.activo === 'n/a') continue
      const t = (totales.por_tipo_activo[x.tipo_concurso] ??= { activo: 0, no_activo: 0 })
      if (x.activo === 'si') {
        totales.activos++
        t.activo++
      } else {
        totales.no_activos++
        t.no_activo++
      }
    }
    return { filas: filasOut, totales }
  }

  // ── Helpers con acceso al catálogo ──
  function motivosNoResolubles(f: FilaNominal): string[] {
    const m: string[] = []
    const sigla = siglaCanonica(f.sigla)
    if (!siglasHospital.has(norm(sigla))) {
      const org = siglasOrganigrama.has(norm(sigla)) ? 'esta en organigramas.sigla' : 'no esta en organigramas.sigla'
      m.push(`sigla fuera de hospitales${esSiglaACrear(f.sigla) ? ' (a crear)' : ''} (${org})`)
    }
    const escalafon = escalafonDeCr.get(upper(f.cr))
    if (!escalafon) m.push('CR sin codigos_registro')
    if (reglaPuestoSucio(f.cr, f.literal_puesto) === 'cr85_tecnico') m.push('puesto a revisar (CR 85 Tecnico sin concurso en el sistema)')
    else if (!norm(f.literal_puesto)) m.push('puesto vacio')
    else if (escalafon && !puestosCat.has(`${escalafon}|${puestoCanonico(f.cr, f.literal_puesto)}`)) {
      m.push('puesto sin equivalencia en catalogo')
    }
    if (norm(f.especialidad_cargo) && !especialidadesCat.has(especialidadCanonica(f.especialidad_cargo))) {
      m.push('especialidad sin catalogo')
    }
    return m
  }
}

function diferencias(
  f: FilaNominal,
  c: CargoSistema,
  propuesto: string | null,
  estadoExcel: EstadoCargoSistema | null,
  escalafonDeCr: Map<string, string>,
): string[] {
  const d: string[] = []
  if (!propuesto) d.push('acronimo/prefijo (sin regla de recodificacion)')
  else if (propuesto !== c.codigo) d.push('acronimo/prefijo')
  const escExcel = escalafonDeCr.get(upper(f.cr))
  const mismoCr = upper(f.cr) === upper(c.cr) || (escExcel !== undefined && escExcel === c.escalafon)
  if (!mismoCr) d.push('cr')
  if (norm(siglaCanonica(f.sigla)) !== norm(c.sigla)) d.push('sigla')
  if (puestoCanonico(f.cr, f.literal_puesto) !== norm(c.puesto)) d.push('puesto')
  if (especialidadCanonica(f.especialidad_cargo) !== norm(c.especialidad)) d.push('especialidad')
  if (estadoExcel && estadoExcel !== c.estado) d.push('estado')
  return d
}

export function claveCupo(sigla: string, acronimo: string, cr: string, puesto: string, especialidad: string, deExcel: boolean): string {
  const p = deExcel ? puestoCanonico(cr, puesto) : norm(puesto)
  const e = deExcel ? especialidadCanonica(especialidad) : norm(especialidad)
  return [norm(siglaCanonica(sigla)), acronimo, p, e].join('|')
}

/** Acrónimo estimado de un cargo del sistema (solo para comparar cupos; sin regla -> 'sin-regla'). */
export function sistemaAcronimo(c: CargoSistema): string {
  // Un codigo ya recodificado (ACRONIMO-NNNNNN) lleva el acronimo del Excel: es la verdad mas estable.
  const m = /^(?:R-)?(.+)-\d{6}$/.exec(c.codigo ?? '')
  if (m && (ACRONIMOS_MSGC as readonly string[]).includes(m[1])) return m[1]
  return (
    acronimoMsgc({
      cr: c.cr ?? '',
      literalPuesto: c.puesto,
      plantaGuardia: null,
      nivelConduccion: null,
      tieneLineaArbol: c.origen === 'organigrama',
      reemplazante: c.tipoOrigen === 'R',
    }) ?? 'sin-regla'
  )
}

function descVinculos(v: VinculosCargo): string {
  const nombres: [keyof VinculosCargo, string][] = [
    ['concursos', 'concursos'],
    ['concursosCph', 'concursos_cph'],
    ['concursosCeetps', 'concursos_ceetps'],
    ['bajas', 'bajas'],
    ['padronHistorico', 'padron_historico'],
    ['padronIncidencias', 'padron_incidencias'],
    ['etiquetas', 'etiquetas_cargo'],
    ['solicitudesAlta', 'solicitudes_alta'],
  ]
  return nombres.filter(([k]) => v[k] > 0).map(([k, n]) => `${n} ${v[k]}`).join(', ')
}

function detectarColisiones(
  cargos: CargoSistema[],
  propuestoPorCargo: Map<string, string>,
  filaDeCargo: Map<string, FilaNominal>,
): Entrada[] {
  const finales = new Map<string, CargoSistema[]>()
  for (const c of cargos) {
    if (!c.codigo) continue
    const final = propuestoPorCargo.get(c.id) ?? c.codigo
    const l = finales.get(final)
    if (l) l.push(c)
    else finales.set(final, [c])
  }
  const out: Entrada[] = []
  for (const [final, lista] of finales) {
    if (lista.length < 2) continue
    for (const c of lista) {
      const f = filaDeCargo.get(c.id)
      const otros = lista.filter((x) => x !== c).map((x) => x.codigo ?? '').sort(cmp).join(', ')
      out.push({
        codigo_excel: f?.codigo_excel ?? '',
        categoria: 'i',
        accion: 'sin accion',
        cargo_codigo_sistema: c.codigo ?? '',
        codigo_propuesto: final,
        acronimo: f?.acronimo ?? '',
        cr: c.cr ?? '',
        sigla: c.sigla,
        puesto: c.puesto,
        motivo: `colision de recodificacion con ${otros}`,
      })
    }
  }
  return out
}
