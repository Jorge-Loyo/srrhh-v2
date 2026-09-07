import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Autorizacion, ConcursoCph, SolicitudAlta, TipoAutorizacion } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import {
  useAutorizaciones,
  useAprobarAutorizacion,
  useRechazarAutorizacion,
} from '../hooks/useAutorizaciones'

// S13-A — Panel de autorizaciones pendientes, filtrado server-side por el rol
// del usuario logueado (ver GET /autorizaciones — resolverPorRolSlug === rolSlug).

const TIPO_LABEL: Record<TipoAutorizacion, string> = {
  concurso_cph: 'Concurso CPH',
  alta_cargo:   'Alta de cargo',
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ── Detalle de referencia por fila — un fetch liviano por tipo, no bloquea la lista ──
function ReferenciaCph({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['concursos-cph', id, 'autorizaciones-ref'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}`)
      return res.data.data
    },
  })
  const cargo = (data?.concurso as unknown as { cargo?: { codigo?: string; literalPuesto?: string; hospital?: { sigla?: string } } })?.cargo
  if (!data) return <span className="text-gray-300 text-xs">Cargando...</span>
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-900 truncate">
        {cargo?.literalPuesto ?? '—'}
        {cargo?.hospital?.sigla && <span className="font-normal text-gray-500"> · {cargo.hospital.sigla}</span>}
      </p>
      <p className="text-xs text-gray-400 font-mono">{cargo?.codigo ?? '—'}</p>
      <Link to={`/concursos/cph/${id}/wizard`} className="text-xs text-secondary hover:underline">
        Abrir wizard →
      </Link>
    </div>
  )
}

function ReferenciaAlta({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['solicitudes-alta', id, 'autorizaciones-ref'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SolicitudAlta }>(`/api/v1/solicitudes-alta/${id}`)
      return res.data.data
    },
  })
  if (!data) return <span className="text-gray-300 text-xs">Cargando...</span>
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-900 truncate">
        {data.literalPuesto}
        {data.hospital?.sigla && <span className="font-normal text-gray-500"> · {data.hospital.sigla}</span>}
      </p>
      <p className="text-xs text-gray-400">
        {data.escalafon?.nombre ?? '—'} · cantidad: {data.cantidad}
        {data.expediente && <> · exp. <span className="font-mono">{data.expediente}</span></>}
      </p>
    </div>
  )
}

function Referencia({ autorizacion }: { autorizacion: Autorizacion }) {
  if (autorizacion.tipo === 'concurso_cph') return <ReferenciaCph id={autorizacion.referenciaId} />
  if (autorizacion.tipo === 'alta_cargo')   return <ReferenciaAlta id={autorizacion.referenciaId} />
  return <span className="text-xs text-gray-400">—</span>
}

export function AutorizacionesPage() {
  const [page, setPage] = useState(1)
  const [tipo, setTipo] = useState<TipoAutorizacion | ''>('')
  const [modal, setModal] = useState<{ id: string; accion: 'aprobar' | 'rechazar' } | null>(null)
  const [obs, setObs] = useState('')

  const { data, isLoading, isError } = useAutorizaciones({
    page,
    limit: 20,
    ...(tipo && { tipo }),
  })
  const aprobar  = useAprobarAutorizacion()
  const rechazar = useRechazarAutorizacion()

  const items = data?.data ?? []
  const meta  = data?.meta

  function cerrarModal() {
    setModal(null)
    setObs('')
  }

  async function confirmar() {
    if (!modal) return
    const mutation = modal.accion === 'aprobar' ? aprobar : rechazar
    await mutation.mutateAsync({ id: modal.id, observaciones: obs || undefined })
    cerrarModal()
  }

  const modalItem = items.find((a) => a.id === modal?.id)
  const enCurso = aprobar.isPending || rechazar.isPending

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Autorizaciones pendientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Lo que te corresponde resolver según tu rol.</p>
        </div>
        <select
          className="input text-sm"
          value={tipo}
          onChange={(e) => { setTipo(e.target.value as TipoAutorizacion | ''); setPage(1) }}
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Modal resolver */}
      {modal && modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-blue-500 text-xl">🔐</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">
                  {modal.accion === 'aprobar' ? 'Aprobar' : 'Rechazar'} autorización
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{TIPO_LABEL[modalItem.tipo]}</p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Observaciones (opcional)</label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={3}
                className="input w-full py-2"
                placeholder="Motivo de la decisión..."
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={cerrarModal} disabled={enCurso}>Cancelar</button>
              <button
                className={modal.accion === 'aprobar' ? 'btn-primary' : 'btn-danger'}
                disabled={enCurso}
                onClick={confirmar}
              >
                {enCurso ? 'Guardando...' : modal.accion === 'aprobar' ? 'Aprobar' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">Cargando…</p>}
      {isError && <p className="text-sm text-danger">No se pudo cargar el listado.</p>}

      {!isLoading && !isError && items.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">No hay autorizaciones pendientes para tu rol. ✓</p>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-4 items-start">
              <span className="text-amber-500 text-lg mt-0.5">⏳</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="badge-warning text-xs">{TIPO_LABEL[a.tipo]}</span>
                  <span className="text-xs text-gray-400 ml-auto">{formatFecha(a.createdAt)}</span>
                </div>
                <Referencia autorizacion={a} />
                {a.solicitadoPor && (
                  <p className="text-xs text-gray-400 mt-1">Solicitado por {a.solicitadoPor.username}</p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  className="btn-danger text-xs px-3 py-1"
                  onClick={() => setModal({ id: a.id, accion: 'rechazar' })}
                >
                  Rechazar
                </button>
                <button
                  className="btn-primary text-xs px-3 py-1"
                  onClick={() => setModal({ id: a.id, accion: 'aprobar' })}
                >
                  Aprobar
                </button>
              </div>
            </li>
          ))}
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
