/**
 * Cada lote viaja a Postgres como UN unico parametro de texto JSON y se desarma en SQL:
 *   FROM json_to_recordset($1::text::json) AS v(id uuid, nombre text, ...)
 *   lista de ids: (SELECT (jsonb_array_elements_text($1::text::jsonb))::uuid)
 * Motivo: Prisma 5.22 envia los parametros array en formato binario infiriendo el tipo desde los valores JS
 * (integer[] si estan vacios o todos null, mezclas null/string...), y eso rompe con 42846 / 22P03.
 * Un parametro de texto no depende de ninguna inferencia. NUNCA pasar arrays JS como parametro.
 */

/** Filas por sentencia (el JSON de 2000 filas pesa unos cientos de KB). */
export const TAMANIO_CHUNK_SQL = 2000

/** Serializa filas u ids a JSON; `undefined` se emite como null explicito (JSON.stringify lo omitiria). */
export function jsonLote(valores: readonly unknown[]): string {
  return JSON.stringify(valores, (_k, v: unknown) => (v === undefined ? null : v))
}

/** Parte una lista en trozos de a lo sumo `n` elementos. */
export function trocear<T>(xs: readonly T[], n = TAMANIO_CHUNK_SQL): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}
