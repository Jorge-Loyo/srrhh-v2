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
export const VERSION_EQUIVALENCIAS = '2026-11-msgc-3'

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
  // ── v3 (12-nov, tabla de los 35 puestos sin equivalencia): confianza 'normalizada' ─────────────────────
  // Mismo puesto y mismo numero de nivel (04/05/06/02); el Excel solo omite el "de". CR 22 y 37 comparten escalafon.
  ['37|jefe unidad (05)', 'jefe de unidad (05)'],
  ['37|jefe seccion (06)', 'jefe de seccion (06)'],
  ['37|jefe division (04)', 'jefe de division (04)'],
  ['37|jefe departamento (02)', 'jefe de departamento (02)'],
  ['22|jefe unidad (05)', 'jefe de unidad (05)'],
  ['22|jefe seccion (06)', 'jefe de seccion (06)'],
  ['22|jefe division (04)', 'jefe de division (04)'],
  ['22|jefe departamento (02)', 'jefe de departamento (02)'],
  // Mismo puesto de guardia; el Excel omite el "en".
  ['23|lic. kinesiologia de guardia', 'lic. en kinesiologia de guardia'],
])
/**
 * Equivalencias de confianza 'propuesta': criterio semantico razonable pero SIN confirmar por Jorge. NO se aplican
 * salvo que se active el flag (`SYNC_EQUIVALENCIAS_PROPUESTAS=1` o `habilitarPropuestas(true)`); mientras tanto esas
 * filas van al fallback "pendiente de curar". Tabla completa y filas que resuelve cada una:
 * .agents/tasks/sync-cargos-msgc/equivalencias_puestos_propuesta.csv
 */
const PUESTOS_PROPUESTOS = new Map<string, string>([
  // Jefaturas de la carrera profesional (37): nombre corto del Excel -> puesto de conduccion del catalogo.
  ['37|jefatura seccion', 'jefe de seccion (06)'],
  ['37|jefatura unid', 'jefe de unidad (05)'],
  ['37|jefatura dept', 'jefe de departamento (02)'],
  ['37|jefatura div', 'jefe de division (04)'],
  ['37|jefatura sdhos', 'sub-director (03)'],
  ['37|jefatura dhos', 'director (01)'],
  // Jefaturas "CA" (carrera administrativa 83) -> puestos de conduccion de la 83.
  ['83|jefatura seccion ca', 'jefe de seccion'],
  ['83|jefatura div ca', 'jefe de division'],
  ['83|jefatura dept ca', 'jefe de departamento'],
  // CEETPS (85) tiene sus jefes marcados pendiente_curar en el catalogo.
  ['85|jefatura seccion ca', 'jefe de seccion'],
  ['85|jefatura div ca', 'jefe de division'],
  // Carrera gerencial (60).
  ['60|jefatura sgo', 'subgerente operativo'],
  ['60|jefatura go', 'gerente operativo'],
  // Profesionales: el Excel no aclara planta/guardia en el literal; se toma el de planta (37) o el de guardia (23).
  ['37|lic. en terapia ocupacional', 'lic. en terapia ocupacional de planta'],
  ['37|licenciado en psicologia / psicologo', 'lic. en psicologia de planta'],
  ['37|lic. en kinesiologia', 'lic. en kinesiologia de planta'],
  ['37|licenciado en kinesiologia', 'lic. en kinesiologia de planta'],
  ['37|lic. en servicio social salud de planta', 'lic. en servicio social de planta'],
  ['37|lic. bioquimico de planta', 'lic. en bioquimica de planta'],
  ['37|kinesiologo fisiatra de planta', 'kinesiologo de planta'],
  ['37|lic. en comunicacion social o en cs.de la comunicacion', 'lic. en comunicacion social de planta'],
  ['23|kinesiologo fisiatra de guardia', 'kinesiologo de guardia'],
  ['23|lic. bioquimico de guardia', 'lic. en bioquimica de guardia'],
  ['23|nutricionista dietista de guardia', 'nutricionista de guardia'],
])
let propuestasHabilitadas = false
/** Activa/desactiva las equivalencias 'propuesta' (para tests y para cuando Jorge las confirme). */
export function habilitarPropuestas(on: boolean): void {
  propuestasHabilitadas = on
}
const usarPropuestas = () => propuestasHabilitadas || process.env.SYNC_EQUIVALENCIAS_PROPUESTAS === '1'

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
  const k = clavePuesto(cr, literal)
  return PUESTOS_EQUIVALENTES.get(k) ?? (usarPropuestas() ? PUESTOS_PROPUESTOS.get(k) ?? null : null)
}
/** Equivalencia 'propuesta' (sin confirmar) del literal, aunque el flag este apagado. Solo para reportes/tests. */
export function equivalenciaPuestoPropuesta(cr: string, literal: string | null | undefined): string | null {
  return PUESTOS_PROPUESTOS.get(clavePuesto(cr, literal)) ?? null
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
// Fuente única en src/shared/acronimoMsgc.ts (la usa también el generador de códigos).
export { ANEXO_II_EXCEL, esAnexoIIExcel } from '../../src/shared/acronimoMsgc.js'
