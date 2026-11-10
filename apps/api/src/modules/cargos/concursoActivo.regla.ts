// ÚNICA FUENTE DE VERDAD de la regla "el concurso cuenta como activo para el
// cargo". La consumen subEstado.repo.ts (Prisma), el paso 11 del padrón y la CTE
// `conc` de Incidencias (fragmentos SQL generados desde estas constantes) y el
// script scripts/sql/recalcular-sub-estado-cargos.sql (atado por test de
// paridad: concursoActivo.regla.test.ts).
//
// Un concurso cuenta cuando:
//   (estado activo según el tipo)  Y
//   (concursos.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR concursos.autorizado_at IS NOT NULL)
// Los concursos que no son de cargo nuevo (incluido motivo NULL) se comportan
// como siempre; los 'nuevo_cargo' solo cuentan una vez autorizados.
import type { Prisma } from '@prisma/client'

/** Motivo que marca un concurso de cargo nuevo (necesita autorización para contar). */
export const MOTIVO_CONCURSO_NUEVO_CARGO = 'nuevo_cargo' as const

// Estados activos por tipo (EstadoConcursoCph / EstadoConcursoCeetps).
export const ESTADOS_CPH_ACTIVOS = ['no_iniciado', 'activo', 'suspendido'] as const
export const ESTADOS_CEETPS_ACTIVOS = ['sin_autorizar', 'autorizado', 'en_proceso'] as const
// Complemento (terminales), para las queries Prisma con not / notIn.
export const ESTADOS_CPH_TERMINALES = ['finalizado'] as const
export const ESTADOS_CEETPS_TERMINALES = ['finalizado', 'desierto'] as const

export interface ConcursoParaRegla {
  tipo: 'cph' | 'ceetps'
  estado: string
  motivoConcurso: string | null | undefined
  autorizadoAt: Date | null | undefined
}

/** ¿El concurso está en un estado activo según su tipo (sin mirar autorización)? */
export function estadoConcursoActivo(tipo: 'cph' | 'ceetps', estado: string): boolean {
  const lista: readonly string[] = tipo === 'cph' ? ESTADOS_CPH_ACTIVOS : ESTADOS_CEETPS_ACTIVOS
  return lista.includes(estado)
}

/** Predicado de autorización: no es de cargo nuevo, o ya está autorizado. NULL cuenta. */
export function concursoAutorizadoParaContar(c: Pick<ConcursoParaRegla, 'motivoConcurso' | 'autorizadoAt'>): boolean {
  return c.motivoConcurso !== MOTIVO_CONCURSO_NUEVO_CARGO || c.autorizadoAt != null
}

/** ¿El concurso cuenta como activo para el cargo? (estado activo Y autorizado/no nuevo). */
export function concursoCuentaComoActivo(c: ConcursoParaRegla): boolean {
  return estadoConcursoActivo(c.tipo, c.estado) && concursoAutorizadoParaContar(c)
}

/** ¿Hay un concurso activo por estado pero sin autorizar (cargo nuevo pendiente)? */
export function concursoPendienteAutorizacion(c: ConcursoParaRegla): boolean {
  return estadoConcursoActivo(c.tipo, c.estado) && !concursoAutorizadoParaContar(c)
}

// Filtro Prisma sobre el Concurso base (relación `concurso` de ConcursoCph/Ceetps).
// `not` de Prisma excluye NULL, por eso el motivo NULL se lista aparte.
export const WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR: Prisma.ConcursoWhereInput = {
  OR: [
    { motivoConcurso: null },
    { motivoConcurso: { not: MOTIVO_CONCURSO_NUEVO_CARGO } },
    { autorizadoAt: { not: null } },
  ],
}

// ─── Fragmentos SQL (construidos desde las mismas constantes) ───────────────
const lista = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(',')

/** `<alias>.estado::text IN ('no_iniciado','activo','suspendido')` */
export const sqlEstadoCphActivo = (alias: string) =>
  `${alias}.estado::text IN (${lista(ESTADOS_CPH_ACTIVOS)})`
/** `<alias>.estado::text IN ('sin_autorizar','autorizado','en_proceso')` */
export const sqlEstadoCeetpsActivo = (alias: string) =>
  `${alias}.estado::text IN (${lista(ESTADOS_CEETPS_ACTIVOS)})`
/** Condición de autorización sobre el alias de `concursos`. */
export const sqlConcursoAutorizadoParaContar = (alias: string) =>
  `(${alias}.motivo_concurso IS DISTINCT FROM '${MOTIVO_CONCURSO_NUEVO_CARGO}' OR ${alias}.autorizado_at IS NOT NULL)`

/**
 * `(EXISTS CPH activo que cuenta OR EXISTS CEETPS activo que cuenta)` para el
 * cargo `cargoIdExpr` (p. ej. `c.id`). Usa los alias cph / ce / co.
 */
export const sqlCargoTieneConcursoActivo = (cargoIdExpr: string) =>
  `(EXISTS (
         SELECT 1 FROM concursos_cph cph
         JOIN concursos co ON co.id = cph.concurso_id
         WHERE cph.cargo_id = ${cargoIdExpr}
           AND ${sqlEstadoCphActivo('cph')}
           AND ${sqlConcursoAutorizadoParaContar('co')})
       OR EXISTS (
         SELECT 1 FROM concursos_ceetps ce
         JOIN concursos co ON co.id = ce.concurso_id
         WHERE ce.cargo_id = ${cargoIdExpr}
           AND ${sqlEstadoCeetpsActivo('ce')}
           AND ${sqlConcursoAutorizadoParaContar('co')}))`
