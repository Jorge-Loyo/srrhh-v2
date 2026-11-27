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
// Esa MISMA lista gestionable se parte además en la dimensión CPH/CEETPS (Paso B
// del flujo de concursos, confirmado por Jorge): CPH = {37,22,23}, CEETPS =
// {85,87} + el 83 del Anexo II. El núcleo único de esa clasificación es
// `tipoConcursoDeCargo`; `esCargoGestionable` se define EN TÉRMINOS de él para
// que NO puedan divergir (tipoConcursoDeCargo(x) !== null ⟺ esCargoGestionable(x)).
//
// El NÚCLEO es PURO y testeable DB-free. El predicado SQL equivalente para
// inyectar en los CTE vive en incidencias.baja-sin-concurso.ts.
//
// `ANEXO_II_83` y la normalización de literal (`normalizarTexto`) se REUSAN de
// derivarRegimen.ts / @srrhh/normalizacion — NO se duplican acá, para que el
// match coincida con el resto del pipeline.
import { ANEXO_II_83 } from '../padron/derivarRegimen.js'
import { normalizarTexto } from '@srrhh/normalizacion'
import { Prisma } from '@prisma/client'

/** Códigos de registro que entran COMPLETOS: 37/22 (CPH), 23 (CPH guardia), 85/87 (CEETPS). */
export const CODIGOS_REGISTRO_GESTIONABLES_PLENOS = ['37', '22', '23', '85', '87'] as const

/** Códigos de registro que clasifican como CPH (Nueva Carrera Profesional Hospitalaria). */
export const CODIGOS_REGISTRO_CPH = ['37', '22', '23'] as const

/** Códigos de registro PLENOS que clasifican como CEETPS (el 83-AnexoII se resuelve por literal). */
export const CODIGOS_REGISTRO_CEETPS_PLENOS = ['85', '87'] as const

export type TipoConcurso = 'cph' | 'ceetps'

/**
 * NÚCLEO PURO — FUENTE DE VERDAD ÚNICA de la regla CPH vs CEETPS por CÓDIGO DE
 * REGISTRO (confirmada por Jorge). Clasifica un cargo/solicitud en:
 *   - 'cph'    si el código ∈ {37,22,23}
 *   - 'ceetps' si el código ∈ {85,87}, o es '83' y el literal del puesto
 *              (normalizado igual que derivarRegimen) ∈ ANEXO_II_83
 *   - null     en cualquier otro caso (NO gestionable → no genera concurso)
 *
 * Es PURO y determinístico (sin Prisma): recibe el código de registro y el
 * literal del puesto, devuelve el tipo. `esCargoGestionable` se define sobre
 * este núcleo, así que por construcción vale:
 *   tipoConcursoDeCargo(x) !== null  ⟺  esCargoGestionable(x) === true
 *
 * @param codigoRegistro `CodigoRegistro.codigo` del cargo (puede ser null). OJO:
 *   es el código de REGISTRO, NO el de escalafón (son valores distintos cuando
 *   un escalafón agrupa varios CR, ej. CPH 22/37).
 * @param literalPuesto Literal del puesto SIN normalizar (solo lo usa el '83').
 */
export function tipoConcursoDeCargo({
  codigoRegistro,
  literalPuesto,
}: {
  codigoRegistro: string | null | undefined
  literalPuesto: string | null | undefined
}): TipoConcurso | null {
  const codigo = (codigoRegistro ?? '').trim()
  if (codigo === '') return null
  if ((CODIGOS_REGISTRO_CPH as readonly string[]).includes(codigo)) return 'cph'
  if ((CODIGOS_REGISTRO_CEETPS_PLENOS as readonly string[]).includes(codigo)) return 'ceetps'
  if (codigo === '83') return ANEXO_II_83.has(normalizarTexto(literalPuesto)) ? 'ceetps' : null
  return null
}

/**
 * Núcleo PURO: ¿el cargo es gestionable? Definido EN TÉRMINOS de
 * `tipoConcursoDeCargo` para que no puedan divergir: gestionable ⟺ el cargo
 * clasifica en algún tipo de concurso (CPH o CEETPS).
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
  return tipoConcursoDeCargo({ codigoRegistro, literalPuesto }) !== null
}

/**
 * Predicado SQL "gestionable" para inyectar en CTEs. Espejo de esCargoGestionable:
 * PLENOS entran completos; el '83' entra solo si el literal normalizado ∈ ANEXO_II_83.
 */
export function sqlCargoGestionable(alias: string): Prisma.Sql {
  const c = Prisma.raw(alias)
  const plenos = Prisma.join([...CODIGOS_REGISTRO_GESTIONABLES_PLENOS])
  const anexoII = Prisma.join([...ANEXO_II_83])
  return Prisma.sql`EXISTS (
    SELECT 1 FROM codigos_registro cr
    WHERE cr.id = ${c}.codigo_registro_id
      AND (
        cr.codigo IN (${plenos})
        OR (
          cr.codigo = '83'
          AND btrim(regexp_replace(lower(unaccent(${c}.literal_puesto)), '\\s+', ' ', 'g')) IN (${anexoII})
        )
      )
  )`
}
