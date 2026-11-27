/**
 * Conceptos clave del padrón SIAL:
 *
 *   id_sial     → legajo de 9 dígitos que identifica a la PERSONA en el ministerio
 *                 Ej: "001780975"
 *                 Vive en: personas.id_sial (cuando se conoce)
 *
 *   id_sial_rol → id_sial + rol, separados por "-", máximo 12 caracteres
 *                 Identifica el PUESTO que ocupa esa persona
 *                 Ej: "001780975-1"
 *                 Vive en: ocupaciones.id_sial_rol
 *
 *   cuil        → campo separado, nunca forma parte del id_sial_rol
 *                 Vive en: personas.cuil, ocupaciones.cuil
 *
 * El padrón SIAL entrega un campo combinado con formato:
 *   {id_sial}-{rol}-{cuil}-{rol}   Ej: "001780975-1-24231236135-1"
 *
 * Ese campo combinado se PARSEA para extraer las partes — no se guarda como está.
 */

export type SialRolPartes = {
  /** Legajo de 9 dígitos. Ej: "001780975" */
  idSial: string
  /** Rol numérico. Ej: "1" */
  rol: string
  /** CUIL extraído del campo combinado. Vacío si el input era solo id_sial_rol */
  cuil: string
  /** El id_sial_rol correcto: idSial-rol. Ej: "001780975-1" */
  idSialRol: string
}

/**
 * Parsea el campo combinado del padrón SIAL ({id_sial}-{rol}-{cuil}-{rol})
 * o un id_sial_rol simple ({id_sial}-{rol}) y devuelve las partes.
 */
export function parsearCampoCombinado(valor: string): SialRolPartes {
  const partes = valor.split('-')

  if (partes.length === 4) {
    const [idSial, rol, cuil] = partes
    return { idSial, rol, cuil, idSialRol: `${idSial}-${rol}` }
  }

  if (partes.length === 2) {
    const [idSial, rol] = partes
    return { idSial, rol, cuil: '', idSialRol: valor }
  }

  throw new Error(`Formato de campo SIAL no reconocido: "${valor}"`)
}

/**
 * Extrae el id_sial_rol (idSial-rol) desde cualquier formato de entrada.
 * Funciona tanto con el campo combinado del padrón como con un id_sial_rol ya limpio.
 */
export function extraerIdSialRol(valor: string): string {
  const partes = valor.split('-')
  return `${partes[0]}-${partes[1]}`
}

/**
 * Extrae el id_sial (legajo, 9 dígitos) desde cualquier formato de entrada.
 */
export function extraerIdSial(valor: string): string {
  return valor.split('-')[0]
}
