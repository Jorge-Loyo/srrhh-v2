import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import type { ConcursoCph } from '@srrhh/types'

interface CphItem extends ConcursoCph {
  concurso?: {
    cargo?: { codigo?: string; literalPuesto?: string; hospital?: { sigla?: string; nombre?: string } }
    persona?: { apellidoNombre?: string }
  }
}

export function AutorizacionesCphPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const esSgrasv = user?.rolSlug === 'sgrasv'

  const [modalId, setModalId]   = useState<string | null>(null)
  const [obs, setObs]           = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cph-autorizaciones'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CphItem[]; meta: { total: number } }>(
        '/api/v1/concursos-cph?pendienteAutorizacion=true&limit=200'
      )
      return res.data
    },
  })

  const autorizar = useMutation({
    mutationFn: ({ id, aprobado }: { id: string; aprobado: boolean }) =>
      apiClient.post(`/api/v1/concursos-cph/${id}/autorizar`, { aprobado, observaciones: obs || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cph-autorizaciones'] })
      setModalId(null)
      setObs('')
    },
  })

  const items = data?.data ?? []
  const modalItem = items.find((c) => c.id === modalId)

  return (
    <div className="space-y-6">

      {/* Modal resolver */}
      {modalId && modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-blue-500 text-xl">🔐</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">Resolver autorización</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {modalItem.concurso?.cargo?.codigo} — {modalItem.concurso?.cargo?.literalPuesto}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Observaciones (opcional)</label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                className="input w-full py-2"
                placeholder="Motivo de aprobación o rechazo..."
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={() => { setModalId(null); setObs('') }}>Cancelar</button>
              <button
                className="btn-danger"
                disabled={autorizar.isPending}
                onClick={() => autorizar.mutate({ id: modalId, aprobado: false })}
              >
                Rechazar
              </button>
              <button
                className="btn-primary"
                disabled={autorizar.isPending}
                onClick={() => autorizar.mutate({ id: modalId, aprobado: true })}
              >
                Aprobar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">Autorizaciones pendientes — CPH</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Concursos con modificaciones de sigla o código de registro que requieren autorización
            </p>
          </div>
          {data && (
            <span className="text-xs text-gray-400 self-center">
              {data.meta.total} pendiente{data.meta.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
        {isError  && <p className="p-6 text-sm text-danger">No se pudo cargar el listado.</p>}

        {!isLoading && !isError && items.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400">
            No hay autorizaciones pendientes. ✓
          </p>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Código Cargo</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Persona de baja</th>
                <th className="px-4 py-3 font-semibold">Sub-estado</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">
                    {c.concurso?.cargo?.codigo ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.concurso?.cargo?.hospital?.sigla ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.concurso?.cargo?.literalPuesto ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.concurso?.persona?.apellidoNombre ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge-warning text-xs">⏳ {c.subEstado ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Link
                        to={`/concursos/cph/${c.id}/wizard`}
                        className="btn-outline text-xs px-3 py-1"
                      >
                        Ver detalle
                      </Link>
                      {esSgrasv && (
                        <button
                          className="btn-primary text-xs px-3 py-1"
                          onClick={() => { setModalId(c.id); setObs('') }}
                        >
                          Resolver
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
