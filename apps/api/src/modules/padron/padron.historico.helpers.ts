// Helpers puros del paso 7 (histórico) de aprobarSnapshotService — FASE 2
// (histórico denso). El paso 7 pasó de DISPERSO (solo roles con diff esa
// semana) a DENSO ACOTADO AL SUBUNIVERSO GESTIONABLE: cada aprobación guarda,
// además de los roles con diff, el estado de toda la dotación gestionable viva
// de esa semana (design §C.2/§C.4, Opción A — dos lecturas unidas en memoria).
//
// Acá vive la parte pura y testeable DB-free: (a) filtrar en memoria la
// dotación viva candidata con `esCargoGestionable` (para quedarse solo con los
// '83' que son Anexo II, que el `where` de Prisma no puede expresar sin
// unaccent/regexp) y (b) deduplicar por `id_sial_rol` el conjunto (roles con
// diff) ∪ (dotación gestionable viva): un rol gestionable que además tuvo diff
// aparece en ambos y `padron_historico` NO tiene unique (snapshot_id,
// id_sial_rol), así que la dedupe DEBE hacerse en memoria (design §C.4).
import { esCargoGestionable } from '../incidencias/incidencias.gestionable.js'

// Forma mínima que el paso 7 necesita de cada ocupación para historiar. Es un
// subconjunto estructural de OcupacionFinalRow (padron.service.ts) + el
// codigoRegistro del cargo, que se incluye para poder evaluar el filtro
// gestionable en memoria sobre la rama del '83'.
export interface OcupacionHistorico {
  idSialRol: string
  cargo: {
    literalPuesto: string | null
    codigoRegistro?: { codigo: string } | null
  }
}

// Filtra la dotación viva candidata dejando SOLO los cargos gestionables,
// reusando el helper puro `esCargoGestionable` de Fase 1 (plenos
// 37/22/23/85/87 enteros; '83' solo si el literal normalizado ∈ ANEXO_II_83).
// El `where` del findMany ya acota a los códigos plenos + '83' por relación;
// este filtro descarta los '83' que NO son Anexo II (lo que el query builder de
// Prisma no puede expresar sin unaccent/regexp sobre el literal).
export function filtrarGestionablesVivas<T extends OcupacionHistorico>(ocupaciones: T[]): T[] {
  return ocupaciones.filter((o) =>
    esCargoGestionable({
      codigoRegistro: o.cargo.codigoRegistro?.codigo ?? null,
      literalPuesto: o.cargo.literalPuesto,
    }),
  )
}

// Une (roles con diff) ∪ (dotación gestionable viva) deduplicando por
// `idSialRol`. Mantiene un único registro por rol (el primero visto; ambos
// conjuntos describen el MISMO estado final del rol esa semana, así que cuál se
// conserva es indistinto). El orden de inserción se preserva (Map mantiene
// orden de inserción): primero los roles con diff, luego los gestionables que
// no estaban ya presentes.
export function deduplicarOcupacionesHistorico<T extends OcupacionHistorico>(
  conDiff: T[],
  gestionablesVivas: T[],
): T[] {
  const porRol = new Map<string, T>()
  for (const o of conDiff) {
    if (!porRol.has(o.idSialRol)) porRol.set(o.idSialRol, o)
  }
  for (const o of gestionablesVivas) {
    if (!porRol.has(o.idSialRol)) porRol.set(o.idSialRol, o)
  }
  return [...porRol.values()]
}
