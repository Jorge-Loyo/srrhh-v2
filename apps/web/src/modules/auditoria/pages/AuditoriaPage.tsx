import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { can } from '@/shared/lib/can'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAuditoria, usePurgarAuditoria, type AuditoriaRow } from '../hooks/useAuditoria'

const LIMIT = 50

const ACCION_BADGE: Record<string, string> = {
  login_success: 'badge-success',
  login_fail: 'badge-danger',
  logout: 'badge-default',
  refresh: 'badge-default',
  create: 'badge-success',
  update: 'badge-warning',
  delete: 'badge-danger',
  purge: 'badge-danger',
  token_revoke: 'badge-warning',
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })
}

function FilaExpandible({ row }: { row: AuditoriaRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtFecha(row.createdAt)}</td>
        <td className="px-4 py-3 font-medium text-gray-800">{row.username ?? <span className="text-gray-400">—</span>}</td>
        <td className="px-4 py-3">
          <span className={ACCION_BADGE[row.accion] ?? 'badge-default'}>{row.accion}</span>
        </td>
        <td className="px-4 py-3 text-gray-600">{row.entidad}</td>
        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.entidadId ?? '—'}</td>
        <td className="px-4 py-3 text-gray-500">{row.ip ?? '—'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
              {JSON.stringify(row.cambios, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

// Migración de la pantalla "Auditoría" del módulo Seguridad legacy. A
// diferencia del legacy no reconstruye un diff visual campo-por-campo — el
// JSON crudo de `cambios` (status + body enmascarado) se muestra en la fila
// expandible, mejora futura opcional si hace falta.
export function AuditoriaPage() {
  const { user } = useAuth()
  const puedePargar = can(user, 'configuracion', 'purgar_auditoria')
  const [searchParams, setSearchParams] = useSearchParams()
  const [dias, setDias] = useState(180)

  const accion = searchParams.get('accion') ?? ''
  const entidad = searchParams.get('entidad') ?? ''
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  const entidadDebounced = useDebounce(entidad, 300)

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
    ...(accion && { accion }),
    ...(entidadDebounced && { entidad: entidadDebounced }),
    ...(desde && { desde }),
    ...(hasta && { hasta }),
  }

  const { data, isLoading, isFetching, isError } = useAuditoria(filters)
  const purgar = usePurgarAuditoria()

  function handlePurgar() {
    if (!confirm(`¿Purgar todos los registros de auditoría más viejos que ${dias} días? Esta acción no se puede deshacer.`)) return
    purgar.mutate(dias, {
      onSuccess: (res) => alert(`Se purgaron ${res.purgados} registros anteriores a ${fmtFecha(res.fechaCorte)}.`),
    })
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-primary text-xl font-bold text-gray-900">Auditoría</h1>
          {puedePargar && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                className="h-10 w-24 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
              />
              <span className="text-sm text-gray-500">días</span>
              <button className="btn-danger" onClick={handlePurgar} disabled={purgar.isPending}>
                {purgar.isPending ? 'Purgando...' : 'Purgar logs'}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={accion}
            onChange={(e) => setParam('accion', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todas las acciones</option>
            {Object.keys(ACCION_BADGE).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            type="text"
            placeholder="Entidad (ej. personas, cargos)"
            value={entidad}
            onChange={(e) => setParam('entidad', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[200px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <input
            type="date"
            value={desde}
            onChange={(e) => setParam('desde', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <input
            type="date"
            value={hasta}
            onChange={(e) => setParam('hasta', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-y-auto min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando auditoría...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el log de auditoría.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para los filtros aplicados.</p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Acción</th>
                    <th className="px-4 py-3 font-semibold">Entidad</th>
                    <th className="px-4 py-3 font-semibold">ID</th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((row) => <FilaExpandible key={row.id} row={row} />)}
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
