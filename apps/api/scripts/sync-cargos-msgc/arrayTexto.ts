/**
 * Prisma serializa los arrays JS vacios o con todos los elementos null como integer[], y Postgres no
 * castea integer[] -> uuid[] (42846). Por eso TODO array va como text[] y se castea en SQL elemento a
 * elemento: `$1::text[]::uuid[]`, `$2::text[]::boolean[]`.
 */
export type ValorArr = string | number | boolean | null | undefined

/** Convierte cada elemento a string|null (boolean -> 'true'/'false', undefined/null -> null). */
export function arrTexto(valores: readonly ValorArr[]): (string | null)[] {
  return valores.map((v) => (v === null || v === undefined ? null : String(v)))
}
