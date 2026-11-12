// ─────────────────────────────────────────────────────────────────────────────
// Tabla de equivalencias versionada Excel MSGC -> catálogos del sistema.
// Jorge: los nombres sucios del Excel se resuelven con EQUIVALENCIAS en el
// sistema (no se corrige el Excel). SOLO LECTURA: este módulo no toca ninguna BD.
//
// Regla común: las claves se normalizan con normalizarTexto (minúscula, sin
// tilde, espacios colapsados). Una clave desconocida devuelve null, nunca lanza.
// Lo que Jorge no resolvió NO se inventa: queda en PUESTOS_SIN_DESTINO y se
// reporta (categoría j del dry-run).
// ─────────────────────────────────────────────────────────────────────────────
import { normalizarTexto } from '@srrhh/normalizacion'

/** Debe coincidir con VERSION_EQUIVALENCIAS de preprocesar_excel.py (lo verifica un test). */
export const VERSION_EQUIVALENCIAS = '2026-11-msgc-2'

// ── Siglas ───────────────────────────────────────────────────────────────────
/**
 * Equivalencias de sigla (clave normalizada -> sigla del maestro `hospitales`). Decisiones de Jorge (12-nov):
 *  - SSAME es errata de SSSAME; ssapac es SSAPAC (case-insensitive).
 *  - Las 15 DGAH<sigla> NO se crean: sus cargos van al hospital que corresponde (DGAHBR -> HBR,
 *    DGAHGACA -> HGACA, ...), es decir, se saca el prefijo "DGA".
 *  - UAIEAIT -> EAIT.
 */
const SIGLAS_DGAH: readonly string[] = [
  'DGAHBR', 'DGAHGACA', 'DGAHGACD', 'DGAHGADS', 'DGAHGAIP', 'DGAHGAJAF', 'DGAHGAP',
  'DGAHGAPP', 'DGAHGARM', 'DGAHGAT', 'DGAHGATA', 'DGAHGAVS', 'DGAHGAZ', 'DGAHGNPE', 'DGAHGNRG',
]
const SIGLAS_EQUIVALENTES = new Map<string, string>([
  ['ssapac', 'SSAPAC'],
  ['ssame', 'SSSAME'],
  ['uaieait', 'EAIT'],
  ...SIGLAS_DGAH.map((s): [string, string] => [normalizarTexto(s), s.slice(3)]),
])
/**
 * Siglas del Excel que siguen fuera del maestro y se crean (Jorge: "crealas y las vamos viendo").
 * Tras las decisiones del 12-nov solo queda SSSAME (SSAME es su errata, las DGAH y UAIEAIT son equivalencias).
 */
export const SIGLAS_A_CREAR: readonly string[] = ['SSSAME']
const SIGLAS_A_CREAR_NORM = new Set(SIGLAS_A_CREAR.map((s) => normalizarTexto(s)))

/** Sigla del maestro equivalente (p. ej. 'ssapac' -> 'SSAPAC'), o null si no hay equivalencia. */
export function equivalenciaSigla(raw: string | null | undefined): string | null {
  return SIGLAS_EQUIVALENTES.get(normalizarTexto(raw)) ?? null
}

/** true si la sigla (ya resuelta por equivalencia) es una de las que hay que crear en el maestro. */
export function esSiglaACrear(raw: string | null | undefined): boolean {
  return SIGLAS_A_CREAR_NORM.has(normalizarTexto(equivalenciaSigla(raw) ?? raw))
}

// ── Puestos ──────────────────────────────────────────────────────────────────
/**
 * Equivalencias de puesto: clave `cr|literal normalizado` -> literal normalizado del catálogo.
 * Fuente: .agents/tasks/nomenclatura-excel-msgc/03_puesto_excel_a_catalogo.csv.
 */
const PUESTOS_EQUIVALENTES = new Map<string, string>([
  // CR 83: plural del catálogo
  ['83|chofer de ambulancias', 'chofer de ambulancia'],
  // CR 85: abreviaturas que son el mismo puesto con otro nombre
  ['85|esterilizacion', 'tecnico en esterilizacion'],
  ['85|necropsia', 'tecnico en necropsia'],
  ['85|farmacia', 'tecnico en farmacia'],
  ['85|radiologia', 'tecnico en radiologia'],
  ['85|laboratorio', 'tecnico en laboratorio'],
  ['85|practicas cardiologicas', 'tecnico en practicas cardiologicas'],
  ['85|asistencia dental', 'tecnico en asistencia dental'],
  ['85|hemoterapia', 'tecnico en hemoterapia'],
  ['85|laboratorio de patologia', 'tecnico en laboratorio de patologia'],
])

/**
 * Puestos sucios que NO tienen un destino fijo en la tabla: se resuelven en el cruce (ver `reglaPuestoSucio`).
 * Decisiones de Jorge (12-nov); el código de registro NO se toca en ningún caso.
 */
export type ReglaPuestoSucio =
  /** CR 87 "Enfermeria": puesto del concurso del sistema (por expediente) o Enfermero Profesional marcado a revisar. */
  | 'cr87_enfermeria'
  /** CR 87 "Tecnico de la Salud": Enfermero Profesional, acrónimo ENF, CR sin cambio. */
  | 'cr87_tecnico_salud'
  /** CR 85 "Tecnico de la Salud" / "Tecnico": puesto del concurso del sistema (si no existe, a revisar). */
  | 'cr85_tecnico'
  /** CR 85 "Enfermeria" o sin puesto: Auxiliar de Enfermería, acrónimo ENF. */
  | 'cr85_auxiliar'
const PUESTOS_SUCIOS = new Map<string, ReglaPuestoSucio>([
  ['87|enfermeria', 'cr87_enfermeria'],
  ['87|tecnico de la salud', 'cr87_tecnico_salud'],
  ['85|tecnico', 'cr85_tecnico'],
  ['85|tecnico de la salud', 'cr85_tecnico'],
  ['85|enfermeria', 'cr85_auxiliar'],
  ['85|', 'cr85_auxiliar'],
])
export const PUESTO_ENFERMERO_PROFESIONAL = 'Enfermero Profesional'
export const PUESTO_AUXILIAR_ENFERMERIA = 'Auxiliar de Enfermería'

const clavePuesto = (cr: string, literal: string | null | undefined) =>
  `${String(cr).trim().toUpperCase()}|${normalizarTexto(literal)}`

/** Puesto del catálogo (normalizado) equivalente al literal del Excel, o null si no hay. */
export function equivalenciaPuesto(cr: string, literal: string | null | undefined): string | null {
  return PUESTOS_EQUIVALENTES.get(clavePuesto(cr, literal)) ?? null
}

/** Regla de resolución del puesto sucio (null si el literal no es uno de los sucios conocidos). */
export function reglaPuestoSucio(cr: string, literal: string | null | undefined): ReglaPuestoSucio | null {
  return PUESTOS_SUCIOS.get(clavePuesto(cr, literal)) ?? null
}

// ── Especialidad ─────────────────────────────────────────────────────────────
/** Jorge: lo que diga "enfermeria" se coloca como "Enfermeros ATC" (después indica los ATP). */
const ESPECIALIDADES_EQUIVALENTES = new Map<string, string>([['enfermeria', 'Enfermeros ATC']])

export function equivalenciaEspecialidad(raw: string | null | undefined): string | null {
  return ESPECIALIDADES_EQUIVALENTES.get(normalizarTexto(raw)) ?? null
}

// ── Anexo II de la 83 (lista del Excel, hoja Criterios) ──────────────────────
/**
 * Jorge: vale la lista del Excel. Capellán y Chofer de funcionario SALEN del Anexo II.
 * Literales normalizados (el Excel trae 'Chofer de Ambulancias' en plural en 5 filas).
 */
export const ANEXO_II_EXCEL: ReadonlySet<string> = new Set<string>([
  'ayudante de laboratorio, hemoterapia, farmacia y drogueria',
  'camillero',
  'chofer de ambulancia',
  'chofer de ambulancias',
  'morguero',
  'cuidador enfermero de animales',
  'oxigenista',
  'radio operador',
  'radio operador de emergencias',
])

export function esAnexoIIExcel(literal: string | null | undefined): boolean {
  return ANEXO_II_EXCEL.has(normalizarTexto(literal))
}
