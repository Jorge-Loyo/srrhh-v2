// Bug A — decisión PURA de precedencia de especialidad_puesto_id (sin Prisma).
//
// Centraliza, de forma testeable, la regla con la que el backend decide qué
// especialidad_puesto_id asignar a un cargo al aprobar un snapshot:
//
//   1. Si el Dotaneitor resolvió un id (marcador / allowlist) y ese id EXISTE en
//      el catálogo del backend Y cuelga del MISMO puesto que el backend resolvió
//      -> se usa ese id directo ('usar-id'). Elimina la doble resolución
//      divergente (causa del cruce Sargenti: el texto re-resuelto a otra FK).
//   2. Si viene un id pero no valida (no existe, o cuelga de otro puesto) -> se
//      cae al resolvedor por texto actual ('fallback-texto').
//   3. Si NO viene id del Dotaneitor:
//      - con texto de especialidad REAL -> 'fallback-texto' (resolver por texto).
//      - con texto vacío/placeholder     -> 'conservar' (no pisar la FK vigente).
//
// El módulo es puro (no toca Prisma) para poder testear la decisión sin tx.

export type AccionEspecialidad = 'usar-id' | 'fallback-texto' | 'conservar'

export interface DecisionEspecialidadParams {
  // id resuelto por el Dotaneitor (marcador __especialidad_puesto_id__ o
  // datos.especialidad_puesto_id). null/'' si no vino.
  idDotaneitor: string | null
  // puestoCargoId del que cuelga idDotaneitor según el catálogo del backend
  // (undefined/null si el id no existe en el catálogo).
  puestoDelId: string | null | undefined
  // puestoCargoId que el backend resolvió para este cargo.
  puestoDelCargo: string
  // Texto de especialidad del SIAL YA normalizado a "real o null"
  // (null = vacío/placeholder como 'SIN ESPECIALIDAD').
  textoEspecialidadReal: string | null
}

// Decide la acción sin ejecutarla. El caller traduce 'usar-id' al id, y
// 'fallback-texto'/'conservar' al resolvedor por texto (que ya implementa la
// regla "vacío = conservar" devolviendo null cuando no hay texto real).
export function decidirEspecialidad(p: DecisionEspecialidadParams): AccionEspecialidad {
  const id = (p.idDotaneitor ?? '').trim()
  if (id) {
    // Validación O(1): existe (puestoDelId definido) y cuelga del puesto correcto.
    if (p.puestoDelId && p.puestoDelId === p.puestoDelCargo) return 'usar-id'
    // Vino un id pero no valida -> fallback por texto.
    return 'fallback-texto'
  }
  // Sin id del Dotaneitor: si hay texto real se resuelve por texto; si no, se
  // conserva la FK vigente (no pisar con null).
  return p.textoEspecialidadReal != null ? 'fallback-texto' : 'conservar'
}
