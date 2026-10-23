import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { TareaPendiente } from '@srrhh/types'
import { useTareas, useResolverTarea } from '../hooks/useTareas'

// Tareas de acción personal del usuario logueado (propias + las de usuarios bajo
// su rol). Hoy el único tipo es el rechazo de autorización de concurso, que linkea
// al wizard del concurso para corregir y reenviar.

function formatFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Link al origen de la tarea según su tipo. Mismo patrón que ReferenciaCph en
// AutorizacionesPage: el rechazo de concurso apunta al wizard del concurso.
function enlaceOrigen(tarea: TareaPendiente): string | null {
  if (tarea.tipo === 'rechazo_autorizacion_concurso') {
    return `/concursos/cph/${tarea.referenciaId}/wizard`
  }
  return null
}

export function TareasPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useTareas({ page, limit: 20, estado: 'pendiente' })
  const resolver = useResolverTarea()

  const items = data?.data ?? []
  const meta = data?.meta

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tareas pendientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Acciones que te quedaron por resolver.</p>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Cargando…</p>}
      {isError && <p className="text-sm text-danger">No se pudo cargar el listado.</p>}

      {!isLoading && !isError && items.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">No tenés tareas pendientes. ✓</p>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((t) => {
            const origen = enlaceOrigen(t)
            return (
              <li key={t.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-4 items-start">
                <span className="text-amber-500 text-lg mt-0.5">📋</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="badge-warning text-xs">Rechazo de autorización</span>
                    <span className="text-xs text-gray-400 ml-auto">{formatFecha(t.createdAt)}</span>
                  </div>
                  {t.mensaje && <p className="text-sm text-gray-700">{t.mensaje}</p>}
                  {origen && (
                    <Link to={origen} className="text-xs text-secondary hover:underline">
                      Abrir origen →
                    </Link>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    className="btn-danger text-xs px-3 py-1"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate(t.id)}
                  >
                    Marcar resuelta
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button className="btn-secondary text-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">Página {meta.page} de {meta.pages}</span>
          <button className="btn-secondary text-sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
