import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useTokens, useRevokeToken, useRevokeAllForUser } from '../hooks/useTokens'

const LIMIT = 50

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

// Migración de la pantalla "Tokens" del módulo Seguridad legacy — lista de
// refresh tokens de sesión (no hay ni hubo API keys/tokens de integración en
// este proyecto, en ninguna de las dos apps). Calcada de PersonasPage.tsx en
// estructura de filtros/tabla/paginación.
export function TokensPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const username = searchParams.get('username') ?? ''
  const mostrarRevocados = searchParams.get('mostrarRevocados') === 'true'
  const page = Number(searchParams.get('page') ?? '1')

  const usernameDebounced = useDebounce(username, 300)

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p === 1) next.delete('page'); else next.set('page', String(p))
      return next
    }, { replace: true })
  }

  const filters = {
    page, limit: LIMIT,
    ...(usernameDebounced && { username: usernameDebounced }),
    ...(!mostrarRevocados && { activo: true }),
  }

  const { data, isLoading, isFetching, isError } = useTokens(filters)
  const revokeToken = useRevokeToken()
  const revokeAllForUser = useRevokeAllForUser()

  function handleRevoke(token: { id: string; username: string }) {
    if (!confirm(`¿Revocar este token de "${token.username}"? La sesión asociada dejará de ser válida.`)) return
    revokeToken.mutate(token.id)
  }

  function handleRevokeAll(usuarioId: string, username: string) {
    if (!confirm(`¿Revocar TODOS los tokens de "${username}"? Cerrará todas sus sesiones activas.`)) return
    revokeAllForUser.mutate(usuarioId)
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h1 className="font-primary text-xl font-bold text-gray-900">Tokens de sesión</h1>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por usuario..."
            value={username}
            onChange={(e) => setParam('username', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={mostrarRevocados}
              onChange={(e) => setParam('mostrarRevocados', e.target.checked ? 'true' : '')}
              className="accent-secondary"
            />
            Mostrar revocados
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-y-auto min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando tokens...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de tokens.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para los filtros aplicados.</p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Creado</th>
                    <th className="px-4 py-3 font-semibold">Expira</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{t.username}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtFecha(t.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtFecha(t.expiresAt)}</td>
                      <td className="px-4 py-3">
                        <span className={t.revocado ? 'badge-danger' : 'badge-success'}>
                          {t.revocado ? 'Revocado' : 'Activo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {!t.revocado && (
                          <>
                            <button
                              className="btn-outline mr-2"
                              disabled={revokeToken.isPending}
                              onClick={() => handleRevoke(t)}
                            >
                              Revocar
                            </button>
                            <button
                              className="btn-outline"
                              disabled={revokeAllForUser.isPending}
                              onClick={() => handleRevokeAll(t.usuarioId, t.username)}
                            >
                              Revocar todos
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={page >= data.meta.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
