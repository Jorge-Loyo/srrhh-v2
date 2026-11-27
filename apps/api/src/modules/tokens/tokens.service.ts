// refresh_tokens fue dropeada (D4). El módulo de tokens queda como stub
// hasta que se reimplemente el refresh con la nueva arquitectura.
import type { ListTokensQuery } from './tokens.schema.js'

export async function listTokensService(_query: ListTokensQuery) {
  return { data: [], meta: { total: 0, page: 1, limit: 20, pages: 0 } }
}

export async function revokeTokenService(_id: string) {
  return { ok: true, cerradas: 0 }
}

export async function revokeAllForUserService(_usuarioId: string) {
  return { revocados: 0 }
}
