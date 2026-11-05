// Filtro "gestionable" de Incidencias — FUENTE DE VERDAD ÚNICA del universo que
// el sector gestiona (bajas, concursos, nuevos cargos). Corrige el bug de hoy:
// Incidencias no filtraba por carrera y mezclaba cargos que el sector solo mira
// pero no acciona.
//
// Regla de negocio (Jorge, 2026-11-05) — reemplaza la lista de 7 códigos del
// design incidencias-expansion §B. Un cargo es GESTIONABLE si su código de
// registro cumple:
//   codigo IN ('37','22','23','85','87')                     (entran COMPLETOS)
//   OR ( codigo = '83' AND literalPuesto ∈ ANEXO_II_83 )     (83 solo Anexo II)
// Los códigos 60/24 (Residencias), 07 (Docentes) y cualquier cargo sin código
// de registro quedan FUERA.
//
// El NÚCLEO (`esCargoGestionable`) es PURO y testeable DB-free. El predicado SQL
// equivalente para inyectar en los CTE vive en incidencias.baja-sin-concurso.ts.
//
// `ANEXO_II_83` y la normalización de literal (`normalizarTexto`) se REUSAN de
// derivarRegimen.ts / @srrhh/normalizacion — NO se duplican acá, para que el
// match coincida con el resto del pipeline.
import { ANEXO_II_83 } from '../padron/derivarRegimen.js'
import { normalizarTexto } from '@srrhh/normalizacion'

/** Códigos de registro que entran COMPLETOS: 37/22 (CPH), 23 (CPH guardia), 85/87 (CEETPS). */
export const CODIGOS_REGISTRO_GESTIONABLES_PLENOS = ['37', '22', '23', '85', '87'] as const

/**
 * Núcleo PURO: ¿el cargo es gestionable? True si el código está en PLENOS, o si
 * es '83' y el literal del puesto (normalizado igual que derivarRegimen) está en
 * ANEXO_II_83. Código null/''/undefined → false (cargo sin CR no es gestionable).
 *
 * @param codigoRegistro `CodigoRegistro.codigo` del cargo (puede ser null).
 * @param literalPuesto Literal del puesto SIN normalizar (solo lo usa el '83').
 */
export function esCargoGestionable({
  codigoRegistro,
  literalPuesto,
}: {
  codigoRegistro: string | null | undefined
  literalPuesto: string | null | undefined
}): boolean {
  const codigo = (codigoRegistro ?? '').trim()
  if (codigo === '') return false
  if ((CODIGOS_REGISTRO_GESTIONABLES_PLENOS as readonly string[]).includes(codigo)) return true
  if (codigo === '83') return ANEXO_II_83.has(normalizarTexto(literalPuesto))
  return false
}
