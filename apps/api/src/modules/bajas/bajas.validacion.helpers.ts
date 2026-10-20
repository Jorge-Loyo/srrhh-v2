// =============================================================================
// Helpers puros de la validación de bajas — sin Prisma ni side effects.
// Fijan las decisiones de Fix 1 (3ª confirmación) y Fix 2 (partición del
// paso 4 de aprobarSnapshotService) para poder testearlas DB-free.
// Si cambia la lógica en el service, actualizar acá también.
// =============================================================================

/**
 * Fix 1 — Regla 4: la 3ª confirmación (padrón + SIAL + usuario) NO cierra el
 * cargo. Debe dejarlo en `validacion_vacante` (pendiente de resolución) y NO
 * habilita un concurso por sí misma; el cierre a `no_vigente` ocurre después,
 * en el flujo de alta-por-baja.
 *
 * Por eso este helper NUNCA devuelve `estado` ni `estadoDesde`: solo registra
 * el expediente/acta administrativa si llegó. Conservar `estadoDesde` original
 * mantiene correcto el contador `diasEnValidacion`.
 */
export function datosTrasConfirmar(actaAdministrativa?: string): { expediente?: string } {
  return actaAdministrativa ? { expediente: actaAdministrativa } : {}
}

/**
 * Fix 2 — Bug B: partición del paso 4 de `aprobarSnapshotService`.
 *
 * Un cargo entra a la resolución automática por `id_sial` SOLO si:
 *   - tiene `idSial` no-NULL, y
 *   - NO es un cargo 24/07 (`!es24y07Set.has(c.id)`).
 * Los cargos 24/07 (incluidos los clones con `idSial` NULL y los preexistentes
 * con `idSial` no-NULL) quedan FUERA de ambas listas: se resuelven íntegramente
 * por el camino `id_sial_rol` (reapertura vía `modificado` + `__reabrir_ocupacion__`,
 * cierre a `validacion_vacante` en el paso 5). Esto evita que un cargo 24/07 en
 * `validacion_vacante` sea forzado a `no_vigente` en cada aprobación del padrón.
 *
 * Dentro de la partición: `idSialsNuevos.has(idSial)` → `aRechazar` (vuelve a
 * vigente), si no → `aConfirmar` (pasa a no_vigente).
 */
export function particionarValidacionPorIdSial(
  cargosEnValidacion: { id: string; idSial: string | null; es24y07: boolean }[],
  idSialsNuevos: Set<string>,
  es24y07Set: Set<string>,
): { aRechazar: string[]; aConfirmar: string[] } {
  const aRechazar: string[] = []
  const aConfirmar: string[] = []
  for (const c of cargosEnValidacion) {
    // Entre un dato vacío y uno que no corresponde, el usuario prefiere vacío:
    // los 24/07 y los cargos sin id_sial no se tocan por este camino.
    if (c.idSial == null || es24y07Set.has(c.id)) continue
    if (idSialsNuevos.has(c.idSial)) aRechazar.push(c.id)
    else aConfirmar.push(c.id)
  }
  return { aRechazar, aConfirmar }
}
