import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RolUsuario, TipoDiff } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAprobarSnapshot, useRechazarSnapshot, useSnapshotDiff } from '../hooks/usePadron'

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

export function PadronDiffPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState<TipoDiff>(TipoDiff.NUEVO)
  const [page, setPage] = useState(1)
  const limit = 50

  const { data, isLoading, isError } = useSnapshotDiff(snapshotId, { page, limit, tipo: tab })
  const aprobar = useAprobarSnapshot()
  const rechazar = useRechazarSnapshot()

  const puedeDecidir = user?.rol === RolUsuario.ADMIN || user?.rol === RolUsuario.EDITOR

  function cambiarTab(nuevoTab: TipoDiff) {
    setTab(nuevoTab)
    setPage(1)
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

  return (
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
                <button className="btn-outline" onClick={handleRechazar} disabled={aprobar.isPending || rechazar.isPending}>
                  Rechazar
                </button>
                <button className="btn-primary" onClick={handleAprobar} disabled={aprobar.isPending || rechazar.isPending}>
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
