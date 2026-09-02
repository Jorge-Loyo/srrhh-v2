import { useState } from 'react'
import type { TipoNotificacion } from '@srrhh/types'
import {
  useNotificaciones,
  useMarcarLeida,
  useMarcarTodasLeidas,
} from '../hooks/useNotificaciones'

const TIPO_LABELS: Record<string, string> = {
  concurso_estancado:     'Concurso estancado',
  baja_pendiente:         'Baja pendiente',
  autorizacion_pendiente: 'Autorización pendiente',
  autorizacion_resuelta:  'Autorización resuelta',
}

const TIPO_BADGE: Record<string, string> = {
  concurso_estancado:     'badge-warning',
  baja_pendiente:         'badge-danger',
  autorizacion_pendiente: 'badge-info',
  autorizacion_resuelta:  'badge-success',
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function NotificacionesPage() {
  const [page, setPage]               = useState(1)
  const [tipo, setTipo]               = useState<TipoNotificacion | ''>('')
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)

  const { data, isLoading } = useNotificaciones({
    page,
    limit: 20,
    ...(tipo && { tipo }),
    ...(soloNoLeidas && { soloNoLeidas: true }),
  })

  const marcarLeida      = useMarcarLeida()
  const marcarTodasLeidas = useMarcarTodasLeidas()

  const notificaciones = data?.data ?? []
  const meta           = data?.meta

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Notificaciones</h1>
        <button
          className="btn-secondary text-sm"
          onClick={() => marcarTodasLeidas.mutate()}
          disabled={marcarTodasLeidas.isPending}
        >
          Marcar todas como leídas
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <select
          className="input text-sm"
          value={tipo}
          onChange={(e) => { setTipo(e.target.value as TipoNotificacion | ''); setPage(1) }}
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox"
            checked={soloNoLeidas}
            onChange={(e) => { setSoloNoLeidas(e.target.checked); setPage(1) }}
          />
          Solo no leídas
        </label>
      </div>

      {/* Lista */}
      {isLoading && <p className="text-sm text-gray-500">Cargando…</p>}

      {!isLoading && notificaciones.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">Sin notificaciones</p>
      )}

      <ul className="space-y-2">
        {notificaciones.map((n) => (
          <li
            key={n.id}
            className={`rounded-lg border p-4 flex gap-4 items-start transition-colors ${
              n.leida ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`badge text-xs ${TIPO_BADGE[n.tipo] ?? 'badge-info'}`}>
                  {TIPO_LABELS[n.tipo] ?? n.tipo}
                </span>
                {!n.leida && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="No leída" />
                )}
                <span className="text-xs text-gray-400 ml-auto">{formatFecha(n.creadaAt)}</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{n.titulo}</p>
              <p className="text-sm text-gray-600 mt-0.5">{n.mensaje}</p>
            </div>
            {!n.leida && (
              <button
                className="text-xs text-blue-600 hover:underline shrink-0 mt-1"
                onClick={() => marcarLeida.mutate(n.id)}
                disabled={marcarLeida.isPending}
              >
                Marcar leída
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Paginación */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            className="btn-secondary text-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">
            Página {meta.page} de {meta.pages}
          </span>
          <button
            className="btn-secondary text-sm"
            disabled={page >= meta.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
