/**
 * Derivación de especialidad desde el nombre del puesto, para cargos NO médicos.
 *
 * Contexto (sesión 2026-10): el padrón trae especialidad solo para médicos
 * (cardiología, pediatría...). Para el resto de los puestos la columna
 * especialidad viene vacía, pero la especialidad está DETERMINADA por el puesto
 * mismo: un "licenciado en enfermería" es Enfermería, un "técnico en radiología"
 * es Radiología, un "chofer de ambulancia" es su propia función. Para los
 * médicos genéricos ("médico de planta", "profesional/especialista guardia
 * médico") NO es derivable (dos médicos de planta pueden ser cardiólogo y
 * pediatra) → se dejan sin especialidad. Los cargos de conducción
 * (jefe/director/gerente) no tienen especialidad clínica.
 *
 * Se usa en dos lugares:
 *  - scripts/backfill_especialidad_no_medicos.ts (backfill de datos actuales)
 *  - resolverPuestoCargo.ts (pipeline del padrón: cada snapshot futuro ya trae
 *    la especialidad derivada sin correr el backfill a mano).
 *
 * La especialidad devuelta queda en minúscula sin tilde, consistente con el
 * resto del catálogo y con la normalización del Dotaneitor. El llamador se
 * ocupa de persistirla (upsert en especialidades_puesto).
 */

// Normalización para comparar: minúscula sin acentos, espacios colapsados.
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Exclusiones: puestos que NO reciben especialidad derivada ──

// Médicos genéricos: la especialidad no la determina el puesto (viene del padrón
// o no existe). NO confundir con profesionales no-médicos (psicólogo,
// kinesiólogo, bioquímico...), que SÍ tienen especialidad = su profesión. El
// "medico veterinario" queda FUERA de la exclusión (es veterinaria, especialidad
// propia determinada por el puesto).
function esMedicoGenerico(p: string): boolean {
  if (p.includes('veterinario')) return false
  return (
    /\bmedico\b/.test(p) ||
    p.includes('profesional guardia medico') ||
    p.includes('especialista en la guardia medico')
  )
}

// Conducción: jefe/director/sub-director/gerente/subsecretario/ministro — cargos
// de gestión, sin especialidad clínica.
function esConduccion(p: string): boolean {
  return (
    /\bjefe de (seccion|unidad|division|departamento)\b/.test(p) ||
    /^director\b/.test(p) || p.startsWith('director general') || p.startsWith('sub-director') ||
    p.startsWith('subsecretario') || p === 'ministro' ||
    /\bgerente operativo\b/.test(p) || /\bsubgerente operativo\b/.test(p) ||
    p.startsWith('vicedirector') || p.startsWith('director inst') || p.startsWith('director gral')
  )
}

// Comodines sin especialidad real.
function esComodin(p: string): boolean {
  return (
    p === 'no aplica' || p === 'personal transitorio' || p === 'pt modulo operativo' ||
    p === 'planta gabinete transitorio' || p === 'personal de gabinete' || p === 'suplente de guardia' ||
    /^\d(ro|do|er|to)?\.?\s*(y\s*\d(ro|do|er|to)?\.?)?\s*año/.test(p) // "1er. año basica"
  )
}

/**
 * Deriva la especialidad (minúscula sin tilde) desde el nombre del puesto.
 * Devuelve null si el puesto no tiene especialidad derivable (médico genérico,
 * conducción, comodín, o nombre vacío).
 */
export function derivarEspecialidadDesdePuesto(nombrePuesto: string | null | undefined): string | null {
  if (!nombrePuesto) return null
  const p = norm(nombrePuesto)
  if (!p) return null

  if (esMedicoGenerico(p) || esConduccion(p) || esComodin(p)) return null

  // Enfermería: todas las variantes a una sola especialidad.
  if (/enfermer/.test(p)) return 'enfermeria'

  // Recorta sufijos de modalidad/situación y códigos de nivel para que
  // "kinesiologo de planta" y "kinesiologo de guardia" colapsen a lo mismo.
  // Trabaja sobre el nombre normalizado (ya minúscula sin tilde).
  let base = p
    .replace(/\s*\(\d+\)\s*$/, '')                  // "(05)", "(06)"
    .replace(/\s+de\s+(planta|guardia)\b.*$/, '')   // "de planta", "de guardia..."
    .replace(/\s+(de|en)\s+la\s+guardia\b.*$/, '')
    .replace(/\s+profesional\b/, '')
    .replace(/^lic\.\s+en\s+/, 'licenciado en ')     // unifica "lic." / "licenciado"
    .trim()

  return base || null
}
