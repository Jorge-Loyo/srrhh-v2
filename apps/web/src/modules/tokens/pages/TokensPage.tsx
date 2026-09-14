import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useTokens, useRevokeToken, useRevokeAllForUser } from '../hooks/useTokens'

const LIMIT = 50

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

// Rediseño 2026-09-14 (pedido explícito): esto ya no es un listado técnico de
// filas de `refresh_tokens` — cada fila de rotación es ruido (una sesión
// rota su token cada `JWT_ACCESS_EXPIRES`, así que en un rato acumula
// decenas), lo que importa es la SESIÓN. Por defecto se ven solo las
// activas ahora mismo, con un botón para cerrarlas al instante; "cerrar" acá
// siempre revoca la sesión completa (ver revokeTokenService), nunca solo un
// registro interno — no se expone el concepto de "token"/"familia" en la UI.
export function TokensPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const username = searchParams.get('username') ?? ''
  const verHistorial = searchParams.get('verHistorial') === 'true'
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
    // Sin "ver historial": solo sesiones activas ahora. Con el toggle: todo
    // (activas + cerradas/expiradas), para quien necesite auditar.
    ...(!verHistorial && { activo: true }),
  }

  const { data, isLoading, isFetching, isError } = useTokens(filters)
  const revokeToken = useRevokeToken()
  const revokeAllForUser = useRevokeAllForUser()

  function handleRevoke(token: { id: string; username: string }) {
    if (!confirm(`¿Cerrar esta sesión de "${token.username}"? Va a tener que volver a iniciar sesión.`)) return
    revokeToken.mutate(token.id)
  }

  function handleRevokeAll(usuarioId: string, username: string) {
    if (!confirm(`¿Cerrar TODAS las sesiones activas de "${username}"? Va a tener que volver a iniciar sesión en todos sus dispositivos.`)) return
    revokeAllForUser.mutate(usuarioId)
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="font-primary text-xl font-bold text-gray-900">Sesiones activas</h1>
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Se actualiza sola cada pocos segundos
          </span>
        </div>

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
              checked={verHistorial}
              onChange={(e) => setParam('verHistorial', e.target.checked ? 'true' : '')}
              className="accent-secondary"
            />
            Ver historial (sesiones ya cerradas/expiradas)
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-y-auto min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando sesiones...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de sesiones.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">
                {verHistorial ? 'Sin resultados para los filtros aplicados.' : 'No hay sesiones activas ahora mismo.'}
              </p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Última actividad</th>
                    <th className="px-4 py-3 font-semibold">Expira</th>
                    <th className="px-4 py-3 font-semibold">IP de origen</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((t) => {
                    const vencida = !t.revocado && new Date(t.expiresAt) <= new Date()
                    const activa = !t.revocado && !vencida
                    return (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{t.username}</td>
                        <td className="px-4 py-3 text-gray-600">{fmtFecha(t.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-600">{fmtFecha(t.expiresAt)}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{t.ip ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={activa ? 'badge-success' : t.revocado ? 'badge-danger' : 'badge-default'}>
                            {activa ? 'Activa' : t.revocado ? 'Cerrada' : 'Expirada'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {activa && (
                            <>
                              <button
                                className="btn-outline mr-2"
                                disabled={revokeToken.isPending}
                                onClick={() => handleRevoke(t)}
                              >
                                Cerrar sesión
                              </button>
                              <button
                                className="btn-outline"
                                disabled={revokeAllForUser.isPending}
                                onClick={() => handleRevokeAll(t.usuarioId, t.username)}
                              >
                                Cerrar todas de este usuario
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
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
