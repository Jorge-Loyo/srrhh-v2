/**
 * Regla de negocio (Jorge): en el alta de cargos, para todos los puestos de
 * enfermería (licenciado o enfermero) la especialidad solo puede ser
 * "Enfermeros ATP" o "Enfermeros ATC".
 *
 * Espejo de apps/web/src/modules/cargos/lib/especialidadesAlta.ts (el front
 * filtra el desplegable; esto valida en el backend). Mantener ambos alineados.
 * Las especialidades se crean con la migración
 * 20261114000000_especialidades_enfermeria_atp_atc.
 */

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Puesto de enfermería: nombre con "enfermer", salvo "auxiliar de enfermería"
// y "cuidador enfermero de animales".
export function esPuestoEnfermeria(nombrePuesto: string | null | undefined): boolean {
  const n = normalizar(nombrePuesto ?? '')
  if (!n.includes('enfermer')) return false
  return !n.startsWith('auxiliar') && !n.startsWith('cuidador')
}

// "Enfermeros ATP", "Enfermero ATC", "Enfermería ATP", "ATP Enfermeros", etc.
export function esEspecialidadEnfermeriaPermitida(nombre: string): boolean {
  const n = normalizar(nombre)
  return /^enfermer[a-z]* at[pc]$/.test(n) || /^at[pc] enfermer[a-z]*$/.test(n)
}

// true si la combinación puesto/especialidad viola la regla. Sin especialidad
// no se rechaza (mientras ATP/ATC no estén cargadas el alta va sin especialidad).
export function violaReglaEnfermeria(nombrePuesto: string, nombreEspecialidad: string | null | undefined): boolean {
  if (!nombreEspecialidad || !esPuestoEnfermeria(nombrePuesto)) return false
  return !esEspecialidadEnfermeriaPermitida(nombreEspecialidad)
}

export const MENSAJE_REGLA_ENFERMERIA =
  'Para puestos de enfermería la especialidad debe ser Enfermeros ATP o Enfermeros ATC'
