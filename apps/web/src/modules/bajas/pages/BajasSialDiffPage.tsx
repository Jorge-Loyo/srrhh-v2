import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useBajasSialDiff, useAprobarBajasSial, useRechazarBajasSial } from '../hooks/useBajasSial'

const TABS = [
  { tipo: 'nuevo',     label: 'Nuevas bajas',   color: 'text-green-700 border-green-500' },
  { tipo: 'eliminado', label: 'Salidas',         color: 'text-red-600 border-red-500' },
  { tipo: 'modificado',label: 'Modificadas',     color: 'text-orange-600 border-orange-500' },
] as const

export function BajasSialDiffPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState<'nuevo' | 'eliminado' | 'modificado'>('nuevo')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useBajasSialDiff(snapshotId, { page, limit: 50, tipo: tab })
  const aprobar  = useAprobarBajasSial()
  const rechazar = useRechazarBajasSial()

  const puedeDecidir = can(user, 'bajas-sial', 'aprobar')

  function cambiarTab(t: typeof tab) { setTab(t); setPage(1) }

  async function handleAprobar() {
    if (!snapshotId) return
    await aprobar.mutateAsync(snapshotId)
    navigate('/bajas-consolidadas')
  }
  async function handleRechazar() {
    if (!snapshotId) return
    if (!window.confirm('¿Rechazar este archivo? Los cambios no se aplicarán.')) return
    await rechazar.mutateAsync(snapshotId)
    navigate('/bajas-consolidadas')
  }

  if (isLoading) return <p className="text-sm text-gray-400">Cargando diferencias...</p>
  if (isError || !data) return <p className="text-sm text-danger">No se pudo cargar el diff.</p>

  const { snapshot, summary, diffs } = data

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">
              Bajas SIAL — {new Date(snapshot.fecha_archivo).toLocaleDateString('es-AR')}
            </h1>
            <p className="text-sm text-gray-500">
              {snapshot.filename} · {snapshot.total_registros.toLocaleString('es-AR')} registros
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={snapshot.estado === 'pendiente' ? 'badge-warning' : snapshot.estado === 'aprobado' ? 'badge-success' : 'badge-danger'}>
              {snapshot.estado}
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

        {/* Resumen de diferencias */}
        <div className="flex gap-4 mt-4">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2">
            <p className="text-xs text-green-600">Nuevas bajas</p>
            <p className="text-xl font-bold text-green-700">+{summary.nuevas}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2">
            <p className="text-xs text-red-500">Salidas del archivo</p>
            <p className="text-xl font-bold text-red-600">−{summary.salidas}</p>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2">
            <p className="text-xs text-orange-500">Registros modificados</p>
            <p className="text-xl font-bold text-orange-600">~{summary.modificadas}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-1">
        {TABS.map((t) => {
          const count = t.tipo === 'nuevo' ? summary.nuevas : t.tipo === 'eliminado' ? summary.salidas : summary.modificadas
          return (
            <button key={t.tipo} onClick={() => cambiarTab(t.tipo)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.tipo ? `${t.color}` : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label} <span className="text-gray-400">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {diffs.data.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Sin registros en esta categoría.</p>
        )}

        {diffs.data.length > 0 && tab !== 'modificado' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">CARGO</th>
                <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                <th className="px-4 py-3 font-semibold">CUIL</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Motivo baja</th>
                <th className="px-4 py-3 font-semibold">Hasta</th>
                <th className="px-4 py-3 font-semibold">En sistema</th>
                <th className="px-4 py-3 font-semibold">Ocup. activa</th>
                <th className="px-4 py-3 font-semibold">Código de cargo</th>
                <th className="px-4 py-3 font-semibold">Cod. registro</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Especialidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {diffs.data.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.cargo}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{d.ayn}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.cuil}</td>
                  <td className="px-4 py-3 text-gray-600">{d.escalafon ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.lit_puesto ?? '—'}</td>
                  <td className="px-4 py-3">
                    {d.mot_baja
                      ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700">{d.mot_baja}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {d.cargo_hasta ? new Date(d.cargo_hasta).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {d.existe_en_personas
                      ? <span className="text-xs text-green-700 font-semibold">✓ Sí</span>
                      : <span className="text-xs text-red-500 font-semibold">✗ No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {d.tiene_ocup_activa
                      ? <span className="text-xs text-blue-700 font-semibold">✓ Activa</span>
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {(d as unknown as Record<string, unknown>)['cod_registro'] as string ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {(d as unknown as Record<string, unknown>)['cod_reg'] as string ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {(d as unknown as Record<string, unknown>)['hospital'] as string ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {(d as unknown as Record<string, unknown>)['especialidad'] as string ?? <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {diffs.data.length > 0 && tab === 'modificado' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">CARGO</th>
                <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                <th className="px-4 py-3 font-semibold">Campo</th>
                <th className="px-4 py-3 font-semibold">Antes</th>
                <th className="px-4 py-3 font-semibold">Después</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {diffs.data.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.cargo}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{d.ayn}</td>
                  <td className="px-4 py-3 font-semibold text-gray-700">{d.campo}</td>
                  <td className="px-4 py-3 text-gray-400">{d.valor_anterior || '—'}</td>
                  <td className="px-4 py-3 text-gray-800">{d.valor_nuevo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {diffs.meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>Página {diffs.meta.page} de {diffs.meta.pages} — {diffs.meta.total} en total</span>
            <div className="flex gap-2">
              <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <button className="btn-outline" disabled={page >= diffs.meta.pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
