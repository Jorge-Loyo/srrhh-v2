import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TipoNotificacion } from '@srrhh/types'
import {
  useNotificaciones,
  useMarcarLeida,
  useMarcarTodasLeidas,
} from '../hooks/useNotificaciones'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { apiClient } from '@/shared/lib/api-client'
import type { ConcursoCph } from '@srrhh/types'

interface CphItem extends Omit<ConcursoCph, 'concurso'> {
  concurso?: {
    cargo?: { codigo?: string; literalPuesto?: string; hospital?: { sigla?: string } }
    persona?: { apellidoNombre?: string }
  }
}

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

type Tab = 'notificaciones' | 'autorizaciones'

interface DetalleModal {
  id: string
  codigo: string
  puesto: string
  hospital: string
  persona: string
  eeBaja: string
  eeConcurso: string
  especialidadOriginal: string
  especialidadSolicitada: string
  codigoRegistroOriginal: string
  codigoRegistroSolicitado: string
  siglaOriginal: string
  siglaSolicitada: string
  subEstado: string
}

export function NotificacionesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const esSgrasv = user?.rolSlug === 'sgrasv'
  const esDirector = user?.rolSlug === 'director'
  const verAutorizaciones = user?.rolSlug === 'director' || user?.rolSlug === 'sgrasv'

  const [tab, setTab]                   = useState<Tab>('notificaciones')
  const [page, setPage]                 = useState(1)
  const [tipo, setTipo]                 = useState<TipoNotificacion | ''>('')
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)
  const [modalId, setModalId]           = useState<string | null>(null)
  const [obs, setObs]                   = useState('')
  const [detalleModal, setDetalleModal] = useState<DetalleModal | null>(null)

  // ── Notificaciones ──────────────────────────────────────────────────────────
  const { data, isLoading } = useNotificaciones({
    page,
    limit: 20,
    ...(tipo && { tipo }),
    ...(soloNoLeidas && { soloNoLeidas: true }),
  })
  const marcarLeida       = useMarcarLeida()
  const marcarTodasLeidas = useMarcarTodasLeidas()
  const notificaciones    = data?.data ?? []
  const meta              = data?.meta

  // ── Autorizaciones CPH ──────────────────────────────────────────────────────
  const { data: autData, isLoading: autLoading, isError: autError } = useQuery({
    queryKey: ['cph-autorizaciones'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CphItem[]; meta: { total: number } }>(
        '/api/v1/concursos-cph?pendienteAutorizacion=true&limit=200'
      )
      return res.data
    },
    enabled: verAutorizaciones,
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

  const autItems   = autData?.data ?? []
  const autTotal   = autData?.meta.total ?? 0
  const modalItem  = autItems.find((c) => c.id === modalId)

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* Modal detalle concurso */}
      {detalleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-amber-500 text-xl">⏳</span>
                <div>
                  <h3 className="font-primary font-bold text-gray-900">Detalle del concurso</h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{detalleModal.codigo}</p>
                </div>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setDetalleModal(null)}>×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Caratulación */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Caratulación</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-gray-500">Puesto:</span> <span className="font-medium text-gray-800">{detalleModal.puesto}</span></div>
                  <div><span className="text-gray-500">Hospital:</span> <span className="font-medium text-gray-800">{detalleModal.hospital}</span></div>
                  <div><span className="text-gray-500">Persona de baja:</span> <span className="font-medium text-gray-800">{detalleModal.persona || '—'}</span></div>
                  <div><span className="text-gray-500">Sub-estado:</span> <span className="font-medium text-gray-800">{detalleModal.subEstado || '—'}</span></div>
                  {detalleModal.eeBaja && <div className="col-span-2"><span className="text-gray-500">EE Baja:</span> <span className="font-mono text-gray-800">{detalleModal.eeBaja}</span></div>}
                  {detalleModal.eeConcurso && <div className="col-span-2"><span className="text-gray-500">EE Concurso:</span> <span className="font-mono text-gray-800">{detalleModal.eeConcurso}</span></div>}
                </div>
              </div>
              {/* Cambios solicitados */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Cambios solicitados</p>
                <div className="space-y-2">
                  {detalleModal.siglaOriginal !== detalleModal.siglaSolicitada && detalleModal.siglaSolicitada && (
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sigla (Hospital)</p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-red-500 line-through">{detalleModal.siglaOriginal || <em className="not-italic text-gray-400">vacío</em>}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-700 font-medium">{detalleModal.siglaSolicitada}</span>
                      </div>
                    </div>
                  )}
                  {detalleModal.codigoRegistroOriginal !== detalleModal.codigoRegistroSolicitado && detalleModal.codigoRegistroSolicitado && (
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Código de registro</p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-red-500 line-through">{detalleModal.codigoRegistroOriginal || <em className="not-italic text-gray-400">vacío</em>}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-700 font-medium">{detalleModal.codigoRegistroSolicitado}</span>
                      </div>
                    </div>
                  )}
                  {!detalleModal.siglaSolicitada && !detalleModal.codigoRegistroSolicitado && (
                    <p className="text-sm text-gray-400">No se registraron cambios específicos.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button className="btn-outline" onClick={() => setDetalleModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal resolver autorización */}
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Notificaciones</h1>
        {tab === 'notificaciones' && (
          <button
            className="btn-secondary text-sm"
            onClick={() => marcarTodasLeidas.mutate()}
            disabled={marcarTodasLeidas.isPending}
          >
            Marcar todas como leídas
          </button>
        )}
      </div>

      {/* Pestañas */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('notificaciones')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'notificaciones'
              ? 'border-navy text-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Notificaciones
        </button>
        {verAutorizaciones && (
          <button
            onClick={() => setTab('autorizaciones')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              tab === 'autorizaciones'
                ? 'border-navy text-navy'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Autorizaciones CPH
            {autTotal > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {autTotal}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── TAB: Notificaciones ─────────────────────────────────────────────── */}
      {tab === 'notificaciones' && (
        <>
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
        </>
      )}

      {/* ── TAB: Autorizaciones CPH ─────────────────────────────────────────── */}
      {tab === 'autorizaciones' && (
        <>
          {autLoading && <p className="text-sm text-gray-500">Cargando…</p>}
          {autError   && <p className="text-sm text-danger">No se pudo cargar el listado.</p>}

          {!autLoading && !autError && autItems.length === 0 && (
            <p className="text-sm text-gray-500 py-8 text-center">No hay autorizaciones pendientes. ✓</p>
          )}

          {!autLoading && !autError && autItems.length > 0 && (
            <ul className="space-y-2">
              {autItems.map((c) => {
                const aprobadoDirector = !!(c as unknown as { aprobadoDirector?: boolean }).aprobadoDirector
                return (
                <li key={c.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-4 items-start">
                  <span className="text-amber-500 text-lg mt-0.5">⏳</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {aprobadoDirector
                        ? <span className="badge-info text-xs">✓ Director aprobó — esperando SGRASV</span>
                        : <span className="badge-warning text-xs">⏳ Esperando aprobación del Director</span>
                      }
                      <span className="font-mono text-xs font-bold text-gray-700">
                        {c.concurso?.cargo?.codigo ?? '—'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {c.concurso?.cargo?.literalPuesto ?? '—'}
                      {c.concurso?.cargo?.hospital?.sigla && (
                        <span className="font-normal text-gray-500"> · {c.concurso.cargo.hospital.sigla}</span>
                      )}
                    </p>
                    {c.concurso?.persona?.apellidoNombre && (
                      <p className="text-xs text-gray-500 mt-0.5">{c.concurso.persona.apellidoNombre}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Sub-estado: {c.subEstado ?? '—'}</p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      className="btn-outline text-xs px-3 py-1"
                      onClick={() => setDetalleModal({
                        id: c.id,
                        codigo: c.concurso?.cargo?.codigo ?? '—',
                        puesto: c.concurso?.cargo?.literalPuesto ?? '—',
                        hospital: c.concurso?.cargo?.hospital?.sigla ?? '—',
                        persona: c.concurso?.persona?.apellidoNombre ?? '',
                        eeBaja: (c as unknown as { eeBaja?: string }).eeBaja ?? '',
                        eeConcurso: (c as unknown as { eeConcurso?: string }).eeConcurso ?? '',
                        especialidadOriginal: (c as unknown as { concurso?: { cargo?: { especialidad?: string } } }).concurso?.cargo?.especialidad ?? '',
                        especialidadSolicitada: (c as unknown as { especialidadSolicitada?: string }).especialidadSolicitada ?? '',
                        codigoRegistroOriginal: (c as unknown as { concurso?: { cargo?: { codigoRegistro?: { literal?: string } } } }).concurso?.cargo?.codigoRegistro?.literal ?? '',
                        codigoRegistroSolicitado: (c as unknown as { codigoRegistroSolicitado?: { literal?: string } }).codigoRegistroSolicitado?.literal ?? '',
                        siglaOriginal: c.concurso?.cargo?.hospital?.sigla ?? '',
                        siglaSolicitada: (c as unknown as { siglaSolicitada?: string }).siglaSolicitada ?? '',
                        subEstado: c.subEstado ?? '',
                      })}
                    >
                      Ver detalle
                    </button>
                    {esDirector && !aprobadoDirector && (
                      <button
                        className="btn-primary text-xs px-3 py-1"
                        onClick={() => { setModalId(c.id); setObs('') }}
                      >
                        Aprobar / Rechazar
                      </button>
                    )}
                    {esSgrasv && aprobadoDirector && (
                      <button
                        className="btn-primary text-xs px-3 py-1"
                        onClick={() => { setModalId(c.id); setObs('') }}
                      >
                        Resolver
                      </button>
                    )}
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
