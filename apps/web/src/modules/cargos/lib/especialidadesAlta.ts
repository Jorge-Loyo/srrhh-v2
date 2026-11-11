import type { PuestoCatalogoEspecialidad } from '@srrhh/types'

// Regla de negocio (Jorge): en el alta de cargos de ENFERMERÍA la especialidad
// solo puede ser "Enfermeros ATP" o "Enfermeros ATC" (sin "(sin especificar)").
// No se inventa catálogo: se filtran las especialidades REALES del puesto
// (mismo endpoint/ids que el resto del sistema) por esos dos nombres.

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Puestos alcanzados: cualquier puesto cuyo nombre contenga "enfermer"
// (Enfermeria, Enfermeria atp, Enfermero profesional, Licenciado en enfermeria,
// Enfermero/a). Se excluyen "auxiliar de enfermeria" y "cuidador enfermero de
// animales", que no son la carrera profesional de enfermería.
export function esPuestoEnfermeria(nombrePuesto: string | null | undefined): boolean {
  const n = normalizar(nombrePuesto ?? '')
  if (!n.includes('enfermer')) return false
  return !n.startsWith('auxiliar') && !n.startsWith('cuidador')
}

const ESPECIALIDAD_ENFERMERIA = /^enfermer[a-z]* at[pc]$/

export function esEspecialidadEnfermeriaPermitida(nombre: string): boolean {
  return ESPECIALIDAD_ENFERMERIA.test(normalizar(nombre))
}

// Para enfermería deja solo ATP/ATC; para el resto devuelve la lista intacta.
export function especialidadesPermitidasAlta(
  nombrePuesto: string | null | undefined,
  especialidades: PuestoCatalogoEspecialidad[],
): PuestoCatalogoEspecialidad[] {
  if (!esPuestoEnfermeria(nombrePuesto)) return especialidades
  return especialidades.filter((e) => esEspecialidadEnfermeriaPermitida(e.nombre))
}
