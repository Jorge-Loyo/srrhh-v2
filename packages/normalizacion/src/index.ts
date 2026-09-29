// @srrhh/normalizacion — fuente de verdad única de normalización de texto.
//
// A21-8 (Sprint 21): antes cada flujo de carga tenía su propia normalización
// suelta (organigrama `normalizarTexto`, bajas-SIAL `str()`+`NOMBRES_CPH_VIEJOS`,
// POU `normalizeCell`), y la lógica rica solo vivía en el Dotaneitor (Python).
// Este paquete unifica la regla del proyecto: **minúscula + sin tilde (manteniendo
// la ñ) + sin mojibake**, más la canonización CPH y utilidades de CUIL/nombre.
// Lo consumen los flujos Node (bajas-SIAL, POU, organigrama). El Dotaneitor
// (Python) mantiene su copia equivalente — ver Doc/Referencias/DOTANEITOR_DECISIONES.md §9.8.

/** Quita acentos/diéresis pero MANTIENE la ñ/Ñ (decisión §9.1). No cambia la caja. */
export function sinTilde(s: string): string {
  return s
    .normalize('NFD')
    // saca diacríticos combinantes excepto la tilde de la ñ (U+0303)
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, '')
    .normalize('NFC')
}

/**
 * Normalización estándar del proyecto para valores de texto que entran a la BD:
 * minúscula + sin tilde (mantiene ñ) + espacios colapsados + trim.
 * Es la regla transversal (§9.1 / A21-1).
 */
export function normalizarTexto(s: string | null | undefined): string {
  if (s == null) return ''
  return sinTilde(String(s)).toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── Mojibake (doble UTF-8) ───────────────────────────────────────────────────
// Paridad con `arreglar_doble_utf8` de services/dotaneitor/normalizador_cargos.py.
// Repara secuencias típicas de texto UTF-8 mal decodificado como Latin-1
// (ej. "MÃ©dico" → "Médico", "AtenciÃ³n" → "Atención").
const MOJIBAKE: [RegExp, string][] = [
  [/Ã¡/g, 'á'], [/Ã©/g, 'é'], [/Ã­/g, 'í'], [/Ã³/g, 'ó'], [/Ãº/g, 'ú'],
  [/Ã�/g, 'Á'], [/Ã‰/g, 'É'], [/Ã�/g, 'Í'], [/Ã“/g, 'Ó'], [/Ãš/g, 'Ú'],
  [/Ã±/g, 'ñ'], [/Ã‘/g, 'Ñ'], [/Ã¼/g, 'ü'], [/Ãœ/g, 'Ü'],
  [/Â/g, ''],
]
export function repararMojibake(s: string): string {
  let out = s
  for (const [re, rep] of MOJIBAKE) out = out.replace(re, rep)
  return out
}

// ── Canonización del escalafón CPH ──────────────────────────────────────────
// Reemplaza a NOMBRES_CPH_VIEJOS duplicado a mano en bajas-sial.service.ts.
// Los nombres históricos del escalafón CPH se unifican al canónico.
const NOMBRES_CPH_VIEJOS = new Set([
  'medicos', 'cph',
  'carrera profesional hospitalaria',
  'nueva carrera prof. hosp',
  'nueva carrera prof hosp',
  'nueva carrera profesional hospitalaria',
])
/** Nombre canónico del escalafón CPH, en minúscula/sin tilde (regla del proyecto). */
export const NOMBRE_CPH_CANONICO = 'nueva carrera profesional hospitalaria'

/**
 * Si el valor es una variante histórica del escalafón CPH, devuelve el canónico;
 * si no, devuelve el valor normalizado tal cual. Tolera el símbolo `|` residual.
 */
export function canonizarCph(v: string | null | undefined): string | null {
  if (v == null) return null
  const limpio = normalizarTexto(String(v).replace(/\|/g, ''))
  if (!limpio) return null
  return NOMBRES_CPH_VIEJOS.has(limpio) ? NOMBRE_CPH_CANONICO : limpio
}

// ── CUIL ─────────────────────────────────────────────────────────────────────
/** Deja solo los 11 dígitos del CUIL (saca guiones/espacios). */
export function cuilPuro(cuil: string | null | undefined): string {
  return (cuil ?? '').replace(/\D/g, '').slice(0, 11)
}

// ── Nombre "Apellido, Nombre" ────────────────────────────────────────────────
export interface NombrePartido {
  /** Forma completa normalizada (minúscula/sin tilde), para `apellido_nombre`. */
  apellidoNombre: string
  /** Todo antes de la primera coma. */
  apellido: string
  /** Todo después de la primera coma; null si no hay coma. */
  nombre: string | null
}

/**
 * Parte "Apellido(s), Nombre(s)" en apellido + nombre por la PRIMERA coma
 * (A21-3 / §9.2). Sin coma → apellido = todo, nombre = null. Todo normalizado
 * a minúscula/sin tilde. Los apellidos compuestos quedan enteros en `apellido`.
 */
export function partirNombre(ayn: string | null | undefined): NombrePartido {
  const completo = normalizarTexto(ayn)
  const i = completo.indexOf(',')
  if (i === -1) {
    return { apellidoNombre: completo, apellido: completo, nombre: null }
  }
  const apellido = completo.slice(0, i).trim()
  const nombre = completo.slice(i + 1).trim() || null
  return { apellidoNombre: completo, apellido, nombre }
}
