import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TipoDiff } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useAprobarSnapshot, useRechazarSnapshot, useSnapshotDiff } from '../hooks/usePadron'
import { apiClient } from '@/shared/lib/api-client'

const TABS: { tipo: TipoDiff; label: string }[] = [
  { tipo: TipoDiff.NUEVO, label: 'Nuevos' },
  { tipo: TipoDiff.MODIFICADO, label: 'Modificados' },
  { tipo: TipoDiff.ELIMINADO, label: 'Eliminados' },
]

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

interface RegistroPersona {
  id_sial?: string
  cuil_y_rol?: string
  ayn?: string
  siglas?: string
  escalafon?: string
  literal_puesto?: string
  especialidad?: string
}

function parseRegistro(json: string | null): RegistroPersona {
  if (!json) return {}
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

export function PadronDiffPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TipoDiff>(TipoDiff.NUEVO)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [modalAprobarTodos, setModalAprobarTodos] = useState(false)
  const limit = 50

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isError } = useSnapshotDiff(snapshotId, {
    page,
    limit,
    tipo: tab,
    q: debouncedSearch || undefined,
    soloPendientes: soloPendientes || undefined,
  })
  const aprobar = useAprobarSnapshot()
  const rechazar = useRechazarSnapshot()

  function optimisticDecision(diffId: string, decision: boolean) {
    queryClient.setQueriesData(
      { queryKey: ['snapshot-diff', snapshotId] },
      (old: any) => {
        if (!old) return old
        return {
          ...old,
          diffs: {
            ...old.diffs,
            data: old.diffs.data.map((d: any) =>
              d.id === diffId ? { ...d, aprobado: decision } : d
            ),
          },
          summary: {
            ...old.summary,
            nuevosPendientes: Math.max(0, (old.summary.nuevosPendientes ?? 0) - 1),
            nuevosRechazados: decision
              ? old.summary.nuevosRechazados
              : (old.summary.nuevosRechazados ?? 0) + 1,
          },
        }
      }
    )
  }

  const aprobarDiff = useMutation({
    mutationFn: (diffId: string) =>
      apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/diffs/${diffId}/aprobar`),
    onMutate: (diffId) => optimisticDecision(diffId, true),
    onSuccess: () => {
      if (soloPendientes) queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }),
  })

  const rechazarDiff = useMutation({
    mutationFn: (diffId: string) =>
      apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/diffs/${diffId}/rechazar`),
    onMutate: (diffId) => optimisticDecision(diffId, false),
    onSuccess: () => {
      if (soloPendientes) queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }),
  })

  const aprobarTodos = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/diffs/aprobar-todos`),
    onSuccess: () => {
      setModalAprobarTodos(false)
      queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] })
    },
  })

  const puedeDecidir = can(user, 'padron', 'aprobar_padron')

  function cambiarTab(nuevoTab: TipoDiff) {
    setTab(nuevoTab)
    setPage(1)
    setSearch('')
    setSoloPendientes(false)
  }

  async function handleAprobar() {
    if (!snapshotId) return
    await aprobar.mutateAsync(snapshotId)
    navigate('/padron')
  }

  async function handleRechazar() {
    if (!snapshotId) return
    if (!window.confirm('¿Rechazar este padrón? Los diffs no se aplicarán a la base de datos.')) return
    await rechazar.mutateAsync(snapshotId)
    navigate('/padron')
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400">Cargando diferencias del padrón...</p>
  }

  if (isError || !data) {
    return <p className="text-sm text-danger">No se pudo cargar el diff de este snapshot.</p>
  }

  const { snapshot, summary, diffs } = data
  const nuevosPendientes = summary.nuevosPendientes ?? 0
  const nuevosRechazados = summary.nuevosRechazados ?? 0
  const hayPendientes = nuevosPendientes > 0

  return (
    <>
      <div className="space-y-6">

        {/* Encabezado del snapshot */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-primary text-xl font-bold text-gray-900">
                Padrón — {snapshot.fechaAsignada}
              </h1>
              <p className="text-sm text-gray-500">
                {snapshot.filename} · {snapshot.totalRegistros} registros procesados
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={
                  snapshot.estado === 'pendiente'
                    ? 'badge-warning'
                    : snapshot.estado === 'aprobado'
                      ? 'badge-success'
                      : 'badge-danger'
                }
              >
                {ESTADO_LABELS[snapshot.estado] ?? snapshot.estado}
              </span>
              {snapshot.estado === 'pendiente' && puedeDecidir && (
                <div className="flex gap-2">
                  <button
                    className="btn-outline"
                    onClick={handleRechazar}
                    disabled={aprobar.isPending || rechazar.isPending}
                  >
                    Rechazar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleAprobar}
                    disabled={aprobar.isPending || rechazar.isPending || hayPendientes}
                    title={hayPendientes ? `Hay ${nuevosPendientes} cargo(s) nuevo(s) sin decisión` : undefined}
                  >
                    {aprobar.isPending ? 'Aprobando...' : 'Aprobar'}
                  </button>
                </div>
              )}
            </div>
          </div>
          {(aprobar.isError || rechazar.isError) && (
            <p className="text-sm text-danger mt-2">
              No se pudo completar la operación. Volvé a intentar en unos segundos.
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex gap-1">
          {TABS.map((t) => {
            const count =
              t.tipo === 'nuevo'
                ? summary.nuevos
                : t.tipo === 'modificado' ? summary.modificados : summary.eliminados
            const badge = t.tipo === 'nuevo' && (nuevosPendientes > 0 || nuevosRechazados > 0)
              ? (
                <span className="ml-1 inline-flex items-center gap-1">
                  {nuevosPendientes > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
                      {nuevosPendientes} pendientes
                    </span>
                  )}
                  {nuevosRechazados > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold">
                      {nuevosRechazados} sin código
                    </span>
                  )}
                </span>
              )
              : null
            return (
              <button
                key={t.tipo}
                onClick={() => cambiarTab(t.tipo)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t.tipo
                    ? 'border-primary text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label} <span className="text-gray-400">({count})</span>{badge}
              </button>
            )
          })}
        </div>

        {/* Contenido de la tab */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* Buscador */}
          <div className="px-4 pt-4 pb-2 flex items-center gap-3">
            <input
              type="search"
              placeholder="Buscar por ID SIAL, CUIL o DNI..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {tab === 'nuevo' && nuevosPendientes > 0 && snapshot.estado === 'pendiente' && puedeDecidir && (
              <button
                onClick={() => setModalAprobarTodos(true)}
                className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
              >
                Aprobar todos ({nuevosPendientes})
              </button>
            )}
            {tab === 'nuevo' && snapshot.estado === 'pendiente' && nuevosPendientes > 0 && (
              <button
                onClick={() => { setSoloPendientes((v) => !v); setPage(1) }}
                className={`text-sm px-3 py-1.5 rounded-md border font-medium transition-colors ${
                  soloPendientes
                    ? 'bg-orange-100 border-orange-300 text-orange-700'
                    : 'border-gray-300 text-gray-500 hover:border-gray-400'
                }`}
              >
                {soloPendientes
                  ? `Solo pendientes (${nuevosPendientes})`
                  : `Todos (${summary.nuevos})`
                }
              </button>
            )}
          </div>

          {diffs.data.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">
              Sin registros {TABS.find((t) => t.tipo === tab)?.label.toLowerCase()} en este snapshot.
            </p>
          )}

          {diffs.data.length > 0 && (tab === 'nuevo' || tab === 'eliminado') && (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold rounded-tl-lg">ID SIAL</th>
                  <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Escalafón</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  {tab === 'nuevo' && <th className="px-4 py-3 font-semibold">Código a generar</th>}
                  {tab === 'nuevo' && <th className="px-4 py-3 font-semibold rounded-tr-lg" />}
                  {tab === 'eliminado' && <th className="px-4 py-3 rounded-tr-lg" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diffs.data.map((d) => {
                  const r = parseRegistro(tab === 'nuevo' ? d.valorNuevo : d.valorAnterior)
                  const isPending = d.aprobado === null
                  const isRechazado = d.aprobado === false
                  const isAprobado = d.aprobado === true
                  const rowClass = isPending
                    ? 'bg-orange-50'
                    : isRechazado
                      ? 'bg-gray-50'
                      : 'hover:bg-gray-50'
                  return (
                    <tr key={d.id} className={rowClass}>
                      <td className="px-4 py-3 text-gray-600">{r.id_sial ?? d.idSialRol}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.ayn ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.siglas ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.escalafon ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.literal_puesto ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.especialidad ?? '—'}</td>
                      {tab === 'nuevo' && (
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                          {isAprobado
                            ? <span className="text-green-600 font-semibold">✓ Asignado</span>
                            : isRechazado
                              ? <span className="text-gray-400">⚠ Sin asignar</span>
                              : (d.codigoPreview
                                  ? <span className="text-blue-700">{d.codigoPreview}</span>
                                  : '—')
                          }
                        </td>
                      )}
                      {tab === 'nuevo' && snapshot.estado === 'pendiente' && puedeDecidir && (
                        <td className="px-4 py-3 text-right">
                          {isAprobado || isRechazado
                            ? (
                              <span className={`text-xs font-semibold ${
                                isAprobado ? 'text-green-600' : 'text-gray-400'
                              }`}>
                                {isAprobado ? '✓ Aprobado' : '✕ Sin código'}
                              </span>
                            )
                            : (
                              <div className="flex gap-1 justify-end">
                                <button
                                  className="btn-primary text-xs px-3 py-1"
                                  disabled={aprobarDiff.isPending || rechazarDiff.isPending}
                                  onClick={() => aprobarDiff.mutate(d.id)}
                                >
                                  Aprobar
                                </button>
                                <button
                                  className="btn-outline text-xs px-3 py-1"
                                  disabled={aprobarDiff.isPending || rechazarDiff.isPending}
                                  onClick={() => rechazarDiff.mutate(d.id)}
                                >
                                  Sin código
                                </button>
                              </div>
                            )
                          }
                        </td>
                      )}
                      {tab === 'nuevo' && snapshot.estado !== 'pendiente' && <td />}
                      {tab === 'eliminado' && <td />}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {diffs.data.length > 0 && tab === 'modificado' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">ID SIAL / Rol</th>
                  <th className="px-4 py-3 font-semibold">Campo</th>
                  <th className="px-4 py-3 font-semibold">Antes</th>
                  <th className="px-4 py-3 font-semibold">Después</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diffs.data.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 text-gray-600">{d.idSialRol}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.campo}</td>
                    <td className="px-4 py-3 text-gray-500">{d.valorAnterior || '—'}</td>
                    <td className="px-4 py-3 text-gray-800">{d.valorNuevo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Paginación */}
          {diffs.meta.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>
                Página {diffs.meta.page} de {diffs.meta.pages} — {diffs.meta.total} en total
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <button
                  className="btn-outline"
                  disabled={page >= diffs.meta.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal confirmar aprobar todos */}
      {modalAprobarTodos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !aprobarTodos.isPending) setModalAprobarTodos(false)
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="font-primary text-lg font-bold text-gray-900">Aprobar todos los pendientes</h2>
            <p className="text-sm text-gray-600">
              Se generará un código para cada uno de los{' '}
              <span className="font-semibold text-gray-900">{nuevosPendientes} cargos pendientes</span>.
              Esta acción no se puede deshacer.
            </p>
            {aprobarTodos.isError && (
              <p className="text-sm text-danger">Ocurrió un error. Volvé a intentar.</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                className="btn-outline"
                onClick={() => setModalAprobarTodos(false)}
                disabled={aprobarTodos.isPending}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={() => aprobarTodos.mutate()}
                disabled={aprobarTodos.isPending}
              >
                {aprobarTodos.isPending ? 'Aprobando...' : `Aprobar ${nuevosPendientes} cargos`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
