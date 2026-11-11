import type { PuestoCatalogoEspecialidad } from '@srrhh/types'

// Regla de negocio (Jorge): en el alta de cargos, para TODOS los puestos de
// enfermería (licenciado o enfermero) la especialidad solo puede ser
// "Enfermeros ATP" o "Enfermeros ATC". Es incondicional: el resto de las
// especialidades del catálogo del puesto (p. ej. "enfermeria") no se ofrecen.
//
// Las dos especialidades se crean en el catálogo real (especialidades_puesto,
// una fila por puesto) con la migración
// prisma/migrations/20261114000000_especialidades_enfermeria_atp_atc.
// Mientras esa migración no esté aplicada, el puesto no trae ATP/ATC: el
// formulario avisa (faltanAtpAtc) y deja dar el alta sin especialidad, en vez
// de quedar bloqueado. La misma regla se valida en el backend
// (apps/api/src/shared/especialidadesEnfermeria.ts).

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Puestos alcanzados: cualquier puesto cuyo nombre contenga "enfermer"
// (Enfermería, Enfermero/a, Enfermero profesional, Enfermero de planta,
// Enfermero jefe, Licenciado/a en enfermería, Lic. en enfermería, ...).
// Se excluyen "auxiliar de enfermería" (no es enfermero ni licenciado) y
// "cuidador enfermero de animales" (no es la carrera de enfermería).
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

export interface EspecialidadesAlta {
  /** Opciones a ofrecer en el desplegable. */
  opciones: PuestoCatalogoEspecialidad[]
  /** true si el puesto es de enfermería (aplica la regla ATP/ATC). */
  esEnfermeria: boolean
  /** true si es enfermería y el catálogo todavía no trae ATP/ATC (migración sin aplicar). */
  faltanAtpAtc: boolean
  /** true si el alta exige elegir especialidad. */
  obligatoria: boolean
}

// Función pura usada por FormAlta.
//  - No enfermería: lista intacta, obligatoria si hay opciones (comportamiento original).
//  - Enfermería con ATP/ATC: solo esas, obligatoria.
//  - Enfermería sin ATP/ATC: sin opciones, aviso, alta permitida sin especialidad.
export function especialidadesPermitidasAlta(
  nombrePuesto: string | null | undefined,
  especialidades: PuestoCatalogoEspecialidad[],
): EspecialidadesAlta {
  if (!esPuestoEnfermeria(nombrePuesto)) {
    return { opciones: especialidades, esEnfermeria: false, faltanAtpAtc: false, obligatoria: especialidades.length > 0 }
  }
  const permitidas = especialidades.filter((e) => esEspecialidadEnfermeriaPermitida(e.nombre))
  return { opciones: permitidas, esEnfermeria: true, faltanAtpAtc: permitidas.length === 0, obligatoria: permitidas.length > 0 }
}
