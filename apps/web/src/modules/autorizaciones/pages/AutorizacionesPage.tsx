import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  baja_cargo:   'Baja de cargo',
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ── Detalle de referencia por fila — un fetch liviano por tipo, no bloquea la lista ──
type CphCargo = { codigo?: string; literalPuesto?: string; especialidad?: string; especialidadLegacy?: string; hospital?: { sigla?: string }; codigoRegistro?: { literal?: string } }
type CphExt = ConcursoCph & { siglaSolicitada?: string | null; especialidadSolicitada?: string | null; puestoSolicitado?: string | null; codigoRegistroSolicitado?: { literal?: string } | null; motivoCambioEspecialidad?: string | null }

function ReferenciaCph({ id, onEsInformativa }: { id: string; onEsInformativa?: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ['concursos-cph', id, 'autorizaciones-ref'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CphExt }>(`/api/v1/concursos-cph/${id}`)
      return res.data.data
    },
  })
  const cargo = (data?.concurso as unknown as { cargo?: CphCargo })?.cargo
  if (!data) return <span className="text-gray-300 text-xs">Cargando...</span>

  const cambios: { campo: string; de: string; a: string }[] = []
  if (data.siglaSolicitada)          cambios.push({ campo: 'Sigla',       de: cargo?.hospital?.sigla ?? '—',                             a: data.siglaSolicitada })
  if (data.codigoRegistroSolicitado) cambios.push({ campo: 'Escalafón',   de: cargo?.codigoRegistro?.literal ?? '—',                   a: data.codigoRegistroSolicitado.literal ?? '—' })
  if (data.especialidadSolicitada)   cambios.push({ campo: 'Especialidad', de: cargo?.especialidadLegacy ?? cargo?.especialidad ?? '—', a: data.especialidadSolicitada })
  if (data.puestoSolicitado)         cambios.push({ campo: 'Puesto',       de: cargo?.literalPuesto ?? '—',                             a: data.puestoSolicitado })

  const esInformativa = cambios.length === 0
  if (esInformativa) onEsInformativa?.(id)

  return (
    <div className="min-w-0 space-y-2">
      <div>
        <p className="text-sm font-semibold text-gray-900 truncate">
          {cargo?.literalPuesto ?? '—'}
          {cargo?.hospital?.sigla && <span className="font-normal text-gray-500"> · {cargo.hospital.sigla}</span>}
        </p>
        <p className="text-xs text-gray-400 font-mono">{cargo?.codigo ?? '—'}</p>
      </div>

      {esInformativa ? (
        <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
          ℹ️ Notificación informativa — se cargó el expediente de concurso <span className="font-mono font-semibold">{data.eeConcurso}</span>. No requiere acción.
        </div>
      ) : (
        <div className="space-y-1.5">
          {cambios.map((c) => (
            <div key={c.campo} className="rounded bg-white border border-amber-200 px-3 py-1.5 text-xs">
              <span className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">{c.campo}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-red-500 line-through">{c.de}</span>
                <span className="text-gray-400">→</span>
                <span className="text-green-700 font-medium">{c.a}</span>
              </div>
            </div>
          ))}
          {data.motivoCambioEspecialidad && (
            <div className="rounded bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
              <span className="font-semibold">Motivo cambio especialidad:</span> {data.motivoCambioEspecialidad}
            </div>
          )}
        </div>
      )}

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

function ReferenciaBaja({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['bajas', id, 'autorizaciones-ref'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { cargo?: { codigo?: string; literalPuesto?: string; hospital?: { sigla?: string } }; motivo?: string; tipoBaja?: string } }>(`/api/v1/bajas/${id}`)
      return res.data.data
    },
  })
  if (!data) return <span className="text-gray-300 text-xs">Cargando...</span>
  const cargo = data.cargo
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-900 truncate">
        {cargo?.literalPuesto ?? '—'}
        {cargo?.hospital?.sigla && <span className="font-normal text-gray-500"> · {cargo.hospital.sigla}</span>}
      </p>
      <p className="text-xs text-gray-400 font-mono">{cargo?.codigo ?? '—'}</p>
      {data.tipoBaja && <p className="text-xs text-gray-500 mt-0.5">Tipo: {data.tipoBaja}</p>}
      {data.motivo && <p className="text-xs text-gray-500">Motivo: {data.motivo}</p>}
    </div>
  )
}

function Referencia({ autorizacion, onEsInformativa }: { autorizacion: Autorizacion; onEsInformativa?: (id: string) => void }) {
  if (autorizacion.tipo === 'concurso_cph') return <ReferenciaCph id={autorizacion.referenciaId} onEsInformativa={onEsInformativa} />
  if (autorizacion.tipo === 'alta_cargo')   return <ReferenciaAlta id={autorizacion.referenciaId} />
  if (autorizacion.tipo === 'baja_cargo')   return <ReferenciaBaja id={autorizacion.referenciaId} />
  return <span className="text-xs text-gray-400">—</span>
}

export function AutorizacionesPage() {
  const [page, setPage] = useState(1)
  const [tipo, setTipo] = useState<TipoAutorizacion | ''>('')
  const [modal, setModal] = useState<{ id: string; accion: 'aprobar' | 'rechazar' } | null>(null)
  const [obs, setObs] = useState('')
  const [informativas, setInformativas] = useState<Set<string>>(new Set())
  // S14-7: modal post-aprobación de alta_cargo
  const [modalConcurso, setModalConcurso] = useState<{
    cargoId: string; hospitalId: string; codigo: string | null
    literalPuesto: string | null; hospitalSigla: string
    tipoConcursoSugerido: 'cph' | 'ceetps'; escalafonId: string
  } | null>(null)
  const navigate = useNavigate()

  function marcarInformativa(referenciaId: string) {
    setInformativas((prev) => prev.has(referenciaId) ? prev : new Set([...prev, referenciaId]))
  }

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
    const result = await mutation.mutateAsync({ id: modal.id, observaciones: obs || undefined })
    // S14-7: si se aprobó una alta_cargo y el cargo puede iniciar concurso, mostrar modal
    if (modal.accion === 'aprobar' && modalItem?.tipo === 'alta_cargo') {
      const res = result as { data?: { puedeIniciarConcurso?: boolean; concursoInfo?: typeof modalConcurso } }
      if (res?.data?.puedeIniciarConcurso && res.data.concursoInfo) {
        setModalConcurso(res.data.concursoInfo)
      }
    }
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

      {/* Modal iniciar concurso post-alta (S14-7) */}
      {modalConcurso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-primary font-bold text-gray-900">¿Iniciar concurso?</h3>
              <p className="text-sm text-gray-500 mt-1">
                El cargo <span className="font-semibold">{modalConcurso.codigo ?? '—'}</span> ({modalConcurso.literalPuesto}) en <span className="font-semibold">{modalConcurso.hospitalSigla}</span> fue creado.
              </p>
            </div>
            <div className="px-6 py-4 text-sm text-gray-600">
              ¿Querés iniciar un concurso <span className="font-semibold uppercase">{modalConcurso.tipoConcursoSugerido}</span> para este cargo ahora?
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={() => setModalConcurso(null)}>Ahora no</button>
              <button
                className="btn-primary"
                onClick={() => {
                  const params = new URLSearchParams({
                    cargoId:       modalConcurso.cargoId,
                    hospitalId:    modalConcurso.hospitalId,
                    tipoConcurso:  modalConcurso.tipoConcursoSugerido,
                    escalafonId:   modalConcurso.escalafonId,
                    motivoConcurso: 'nuevo_cargo',
                    origen:        'Alta de cargo',
                    fechaVacante:  new Date().toISOString().slice(0, 10),
                  })
                  setModalConcurso(null)
                  navigate(`/concursos/${modalConcurso.tipoConcursoSugerido === 'cph' ? 'cph/nuevo/wizard' : `ceetps/nuevo`}?${params}`)
                }}
              >
                Sí, iniciar concurso
              </button>
            </div>
          </div>
        </div>
      )}

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
                <Referencia autorizacion={a} onEsInformativa={marcarInformativa} />
                {a.solicitadoPor && (
                  <p className="text-xs text-gray-400 mt-1">Solicitado por {a.solicitadoPor.username}</p>
                )}
              </div>
              {!informativas.has(a.referenciaId) && (
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
              )}
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
