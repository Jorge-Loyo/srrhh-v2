// ─────────────────────────────────────────────────────────────────────────────
// Escalafón CPH -> código principal 37 y nombre "Nueva Carrera Profesional Hospitalaria" (decisión de
// Jorge, 12-nov). Se ejecuta en el modo escritura (SOLO base local) DESPUÉS de la limpieza y ANTES de la
// carga y la recodificación.
//
//   base actual : escalafones.codigo = '22', nombre "Nueva Carrera Prof. Hosp"  -> se actualizan los dos.
//   base nueva  : escalafones.codigo = '37' con el nombre nuevo                 -> no hace nada (idempotente).
//
// Los códigos de registro 22 y 37 siguen asociados al escalafón (cuelgan de escalafones.id, que no cambia) y
// los cargos conservan su código de registro: este paso NO toca codigos_registro ni cargos.
// ─────────────────────────────────────────────────────────────────────────────
// Constantes propias (NO se importan de @srrhh/types): el contenedor de la copia local corre el codigo de la imagen,
// cuyo packages/types puede ser anterior a este ajuste. escalafon.test.ts verifica que coincidan con las de @srrhh/types.
export const CODIGO_ESCALAFON_CPH_ACTUAL = '22'
export const CODIGO_ESCALAFON_CPH_NUEVO = '37'
export const NOMBRE_ESCALAFON_CPH_NUEVO = 'Nueva Carrera Profesional Hospitalaria'

export interface EscalafonFila {
  id: string
  codigo: string
  nombre: string
}

export type PlanEscalafonCph =
  | { accion: 'ya_aplicado'; escalafonId: string }
  | { accion: 'actualizar'; escalafonId: string; codigoActual: string; nombreActual: string; codigoNuevo: string; nombreNuevo: string }

/**
 * Plan puro a partir de los escalafones con código 22 o 37. Lanza si el estado es ambiguo o no hay escalafón CPH:
 * seguir con la carga sobre un catálogo inesperado sería peor que abortar.
 */
export function planificarEscalafonCph(escalafones: readonly EscalafonFila[]): PlanEscalafonCph {
  const e22 = escalafones.find((e) => e.codigo.trim() === CODIGO_ESCALAFON_CPH_ACTUAL)
  const e37 = escalafones.find((e) => e.codigo.trim() === CODIGO_ESCALAFON_CPH_NUEVO)
  if (e22 && e37) {
    throw new Error('Escalafon CPH ambiguo: existen los escalafones con codigo 22 y 37 a la vez; resolver a mano antes de sincronizar.')
  }
  const e = e22 ?? e37
  if (!e) throw new Error('No existe el escalafon CPH (codigo 22 o 37): no se puede seguir con la carga.')
  if (e.codigo.trim() === CODIGO_ESCALAFON_CPH_NUEVO && e.nombre === NOMBRE_ESCALAFON_CPH_NUEVO) {
    return { accion: 'ya_aplicado', escalafonId: e.id }
  }
  return {
    accion: 'actualizar',
    escalafonId: e.id,
    codigoActual: e.codigo,
    nombreActual: e.nombre,
    codigoNuevo: CODIGO_ESCALAFON_CPH_NUEVO,
    nombreNuevo: NOMBRE_ESCALAFON_CPH_NUEVO,
  }
}

export interface RepoEscalafon {
  /** Escalafones con codigo '22' o '37'. */
  escalafonesCph(): Promise<EscalafonFila[]>
  /** UPDATE escalafones SET codigo, nombre WHERE id. */
  actualizarEscalafon(id: string, codigo: string, nombre: string): Promise<void>
}

export interface ResultadoEscalafon {
  accion: PlanEscalafonCph['accion']
  codigoAntes: string
  codigoDespues: string
}

/** Aplica el plan. Idempotente: con el escalafón ya en 37 y nombre nuevo no escribe nada. */
export async function ejecutarEscalafonCph(repo: RepoEscalafon): Promise<ResultadoEscalafon> {
  const filas = await repo.escalafonesCph()
  const plan = planificarEscalafonCph(filas)
  if (plan.accion === 'ya_aplicado') {
    return { accion: 'ya_aplicado', codigoAntes: CODIGO_ESCALAFON_CPH_NUEVO, codigoDespues: CODIGO_ESCALAFON_CPH_NUEVO }
  }
  await repo.actualizarEscalafon(plan.escalafonId, plan.codigoNuevo, plan.nombreNuevo)
  return { accion: 'actualizar', codigoAntes: plan.codigoActual, codigoDespues: plan.codigoNuevo }
}
