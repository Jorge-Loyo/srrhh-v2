import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RolUsuario, TipoDiff } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
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

// nuevos/eliminados vienen con el registro completo serializado como JSON en
// valorNuevo/valorAnterior (así lo arma padron.service.ts al recibir el diff
// de Dotaneitor) — no como columnas propias. Se parsea acá para mostrar una
// tabla legible en vez del JSON crudo.
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

interface ConflictoValidacion {
  cargoId: string
  codigo: string | null
  literalPuesto: string | null
  hospital: string
  escalafon: string
  diasEnValidacion: number | null
  ultimaPersona: { apellidoNombre: string; cuil: string } | null
}

export function PadronDiffPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [tab, setTab] = useState<TipoDiff>(TipoDiff.NUEVO)
  const [page, setPage] = useState(1)
  const [mostrarConflictos, setMostrarConflictos] = useState(false)
  const limit = 50

  const { data, isLoading, isError } = useSnapshotDiff(snapshotId, { page, limit, tipo: tab })
  const aprobar = useAprobarSnapshot()
  const rechazar = useRechazarSnapshot()

  // S8A-3: consultar conflictos de validacion_vacante
  const { data: conflictosData } = useQuery({
    queryKey: ['conflictos-validacion', snapshotId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { conflictos: ConflictoValidacion[] } }>(
        `/api/v1/padron/snapshots/${snapshotId}/conflictos-validacion`
      )
      return res.data.data
    },
    enabled: !!snapshotId,
  })

  const confirmarValidacion = useMutation({
    mutationFn: async ({ cargoId, accion }: { cargoId: string; accion: 'confirmar' | 'rechazar' }) =>
      apiClient.post(`/api/v1/bajas/validacion/${cargoId}/${accion}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflictos-validacion', snapshotId] })
      queryClient.invalidateQueries({ queryKey: ['validacion-bajas'] })
    },
  })

  const conflictos = conflictosData?.conflictos ?? []
  const hayConflictos = conflictos.length > 0

  const puedeDecidir = user?.rol === RolUsuario.ADMIN || user?.rol === RolUsuario.EDITOR

  function cambiarTab(nuevoTab: TipoDiff) {
    setTab(nuevoTab)
    setPage(1)
  }

  async function handleAprobar() {
    if (!snapshotId) return
    if (hayConflictos) { setMostrarConflictos(true); return }
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

  return (
    <div className="space-y-6">

      {/* S8A-3: Panel bloqueante de conflictos validacion_vacante */}
      {mostrarConflictos && hayConflictos && (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="font-primary text-base font-bold text-orange-900">
                No se puede aprobar — {conflictos.length} cargo{conflictos.length !== 1 ? 's' : ''} en validación vuelven a aparecer en el padrón
              </h2>
              <p className="text-sm text-orange-700 mt-1">
                Resolvé cada caso antes de aprobar: confirmá la baja (el cargo queda <strong>no vigente</strong>) o rechazála (el cargo vuelve a <strong>vigente</strong>).
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-orange-200">
            <table className="w-full text-sm">
              <thead className="bg-orange-100 text-orange-800 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Código</th>
                  <th className="px-4 py-2.5 font-semibold">Hospital</th>
                  <th className="px-4 py-2.5 font-semibold">Puesto</th>
                  <th className="px-4 py-2.5 font-semibold">Días en validación</th>
                  <th className="px-4 py-2.5 font-semibold">Última persona</th>
                  <th className="px-4 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100 bg-white">
                {conflictos.map((c) => (
                  <tr key={c.cargoId}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{c.codigo ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.hospital}</td>
                    <td className="px-4 py-3 text-gray-600">{c.literalPuesto ?? '—'}</td>
                    <td className="px-4 py-3 text-orange-700 font-semibold">{c.diasEnValidacion ?? '—'}d</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {c.ultimaPersona ? `${c.ultimaPersona.apellidoNombre} (${c.ultimaPersona.cuil})` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          className="btn-outline text-xs px-2 py-1"
                          disabled={confirmarValidacion.isPending}
                          onClick={() => confirmarValidacion.mutate({ cargoId: c.cargoId, accion: 'rechazar' })}
                        >
                          Rechazar baja
                        </button>
                        <button
                          className="btn-primary text-xs px-2 py-1"
                          disabled={confirmarValidacion.isPending}
                          onClick={() => confirmarValidacion.mutate({ cargoId: c.cargoId, accion: 'confirmar' })}
                        >
                          Confirmar baja
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {conflictos.length === 0 && (
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => { setMostrarConflictos(false); handleAprobar() }}>
                Todos resueltos — Aprobar padrón →
              </button>
            </div>
          )}
        </div>
      )}

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
                <button className="btn-outline" onClick={handleRechazar} disabled={aprobar.isPending || rechazar.isPending}>
                  Rechazar
                </button>
                <button className="btn-primary" onClick={handleAprobar} disabled={aprobar.isPending || rechazar.isPending}>
                  {aprobar.isPending ? 'Aprobando...' : hayConflictos ? `⚠️ Aprobar (${conflictos.length} conflicto${conflictos.length !== 1 ? 's' : ''})` : 'Aprobar'}
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
            t.tipo === 'nuevo' ? summary.nuevos : t.tipo === 'modificado' ? summary.modificados : summary.eliminados
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
              {t.label} <span className="text-gray-400">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Contenido de la tab */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {diffs.data.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">
            Sin registros {TABS.find((t) => t.tipo === tab)?.label.toLowerCase()} en este snapshot.
          </p>
        )}

        {diffs.data.length > 0 && (tab === 'nuevo' || tab === 'eliminado') && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">ID SIAL</th>
                <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Especialidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {diffs.data.map((d) => {
                const r = parseRegistro(tab === 'nuevo' ? d.valorNuevo : d.valorAnterior)
                return (
                  <tr key={d.id}>
                    <td className="px-4 py-3 text-gray-600">{r.id_sial ?? d.idSialRol}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.ayn ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.siglas ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.escalafon ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.literal_puesto ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.especialidad ?? '—'}</td>
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
  )
}
