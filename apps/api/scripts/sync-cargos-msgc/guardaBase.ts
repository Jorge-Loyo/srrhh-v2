// ─────────────────────────────────────────────────────────────────────────────
// Salvaguarda anti-Neon: el modo escritura del sync solo corre contra una base
// LOCAL. Se niega si la URL apunta a neon.tech o a un host que no sea local.
// Nunca se loguea la contraseña ni la URL completa.
// ─────────────────────────────────────────────────────────────────────────────
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', 'srrhh_postgres', 'postgres_sync'])

/** Lanza Error si la URL no es una base local segura. Devuelve el host aceptado. */
export function asegurarBaseLocal(url: string | undefined | null): string {
  if (!url || !url.trim()) throw new Error('guardaBase: DATABASE_URL vacia; se niega a escribir.')
  const crudo = url.trim()
  // Chequeo grueso sobre el texto completo (cubre userinfo, query y mayusculas).
  if (/neon\.tech/i.test(crudo)) throw new Error('guardaBase: la URL apunta a neon.tech; el modo escritura solo corre en base local.')
  let host: string
  try {
    host = new URL(crudo).hostname.toLowerCase()
  } catch {
    throw new Error('guardaBase: URL de base no parseable; se niega a escribir.')
  }
  if (host.endsWith('neon.tech')) throw new Error('guardaBase: la URL apunta a neon.tech; el modo escritura solo corre en base local.')
  if (!HOSTS_LOCALES.has(host)) {
    throw new Error(`guardaBase: host "${host}" no es local (localhost, 127.0.0.1, srrhh_postgres, postgres_sync); se niega a escribir.`)
  }
  return host
}
