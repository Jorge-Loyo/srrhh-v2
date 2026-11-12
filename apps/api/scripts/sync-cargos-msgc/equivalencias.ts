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
export const VERSION_EQUIVALENCIAS = '2026-11-msgc-1'

// ── Siglas ───────────────────────────────────────────────────────────────────
/** Equivalencias de sigla (clave normalizada -> sigla del maestro `hospitales`). */
const SIGLAS_EQUIVALENTES = new Map<string, string>([['ssapac', 'SSAPAC']])

/**
 * Las otras 18 siglas del Excel que no están en el maestro (04_siglas_fuera_del_maestro.csv).
 * Jorge: "crealas y la vamos viendo, pero verifica si están en el organigrama".
 * Quedan SIN mapear: el dry-run las lista como "crear" (y si existen en organigramas.sigla).
 * Incluye SSAME y SSSAME (SSAME no se asume typo de SSSAME).
 */
export const SIGLAS_A_CREAR: readonly string[] = [
  'SSSAME', 'SSAME', 'UAIEAIT',
  'DGAHBR', 'DGAHGACA', 'DGAHGACD', 'DGAHGADS', 'DGAHGAIP', 'DGAHGAJAF', 'DGAHGAP',
  'DGAHGAPP', 'DGAHGARM', 'DGAHGAT', 'DGAHGATA', 'DGAHGAVS', 'DGAHGAZ', 'DGAHGNPE', 'DGAHGNRG',
]
const SIGLAS_A_CREAR_NORM = new Set(SIGLAS_A_CREAR.map((s) => normalizarTexto(s)))

/** Sigla del maestro equivalente (p. ej. 'ssapac' -> 'SSAPAC'), o null si no hay equivalencia. */
export function equivalenciaSigla(raw: string | null | undefined): string | null {
  return SIGLAS_EQUIVALENTES.get(normalizarTexto(raw)) ?? null
}

/** true si la sigla es una de las que hay que crear en el maestro. */
export function esSiglaACrear(raw: string | null | undefined): boolean {
  return SIGLAS_A_CREAR_NORM.has(normalizarTexto(raw))
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
 * Puestos sucios para los que Jorge NO indicó el puesto destino (clave `cr|literal`).
 * No se inventa: el dry-run los informa como "sin equivalencia" (categoría j).
 *  - CR 87 `enfermeria` / `tecnico de la salud`, CR 85 `tecnico`, `enfermeria`,
 *    `tecnico de la salud` y vacío: el reporte previo los marca "A CONFIRMAR cuál".
 */
const PUESTOS_SIN_DESTINO = new Set<string>([
  '87|enfermeria',
  '87|tecnico de la salud',
  '85|tecnico',
  '85|enfermeria',
  '85|tecnico de la salud',
  '85|',
])

const clavePuesto = (cr: string, literal: string | null | undefined) =>
  `${String(cr).trim().toUpperCase()}|${normalizarTexto(literal)}`

/** Puesto del catálogo (normalizado) equivalente al literal del Excel, o null si no hay. */
export function equivalenciaPuesto(cr: string, literal: string | null | undefined): string | null {
  return PUESTOS_EQUIVALENTES.get(clavePuesto(cr, literal)) ?? null
}

/** true si el literal es conocido como sucio pero Jorge no definió el destino. */
export function puestoSinDestino(cr: string, literal: string | null | undefined): boolean {
  return PUESTOS_SIN_DESTINO.has(clavePuesto(cr, literal))
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
