// Núcleo PURO (sin Prisma) del sub-estado PERSISTIDO del cargo.
//
// `cargos.sub_estado` es una columna persistida (no un cálculo al vuelo) que
// describe el PRESENTE del cargo vigente: ocupado | vacante | concurso, y null
// cuando el cargo NO es vigente. Esta función es la única fuente de verdad de
// ese valor y debe invocarse en TODA transacción que cambie el estado del
// cargo o su ocupación/concurso, para que el persistido no quede viejo.
//
// La regla está alineada con las cascadas de clasificación ya existentes (NO
// crea una tercera definición):
//   - incidencias.clasificacion.ts `clasificarCargo` (no_vigente → ocupado →
//     en_concurso → …)
//   - kpis/cargos-indicadores.clasificacion.ts `clasificarCargo` (R3 ocupado,
//     R4 concurso, R9 vacante)
// El sub_estado solo distingue ocupado/vacante/concurso; no existe
// 'indeterminado' (ese valor es de la RECONSTRUCCIÓN del pasado, no del
// presente persistido). Un cargo vigente sin ocupante cae en 'concurso' si hay
// concurso activo y en 'vacante' si no. Ver .agents/tasks/fix-sub-estado/design.md §0.
import type { SubEstadoCargo } from '@srrhh/types'

export interface SubEstadoFacts {
  // string para tolerar valores inesperados (cualquier estado distinto de
  // 'vigente' resuelve a null, igual que las cascadas de clasificación).
  estado: 'vigente' | 'no_vigente' | 'validacion_vacante' | string
  tieneOcupanteVigente: boolean
  tieneConcursoActivo: boolean
}

/**
 * Sub-estado persistido del cargo según la verdad del presente.
 *   §0.1 estado <> 'vigente'                         -> null
 *   §0.2 vigente + ocupante vigente                  -> 'ocupado'
 *   §0.3 vigente, sin ocupante, con concurso activo  -> 'concurso'
 *   §0.4 vigente, sin ocupante, sin concurso activo  -> 'vacante'
 */
export function calcularSubEstado(f: SubEstadoFacts): SubEstadoCargo | null {
  if (f.estado !== 'vigente') return null
  if (f.tieneOcupanteVigente) return 'ocupado'
  if (f.tieneConcursoActivo) return 'concurso'
  return 'vacante'
}
