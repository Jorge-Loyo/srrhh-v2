import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { Notificacion, NotificacionDetalle, TipoNotificacion } from '@srrhh/types'
import {
  useNotificaciones,
  useMarcarLeida,
  useMarcarTodasLeidas,
  useNotificacionDetalle,
} from '../hooks/useNotificaciones'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { useAutorizacionesPendientes } from '@/modules/autorizaciones/hooks/useAutorizaciones'
import { can } from '@/shared/lib/can'

const TIPO_LABELS: Record<string, string> = {
  concurso_estancado:     'Concurso estancado',
  baja_pendiente:         'Baja pendiente',
  autorizacion_pendiente: 'Autorización pendiente',
  autorizacion_resuelta:  'Autorización resuelta',
  concurso_iniciado:      'Concurso iniciado',
}

const TIPO_BADGE: Record<string, string> = {
  concurso_estancado:     'badge-warning',
  baja_pendiente:         'badge-danger',
  autorizacion_pendiente: 'badge-info',
  autorizacion_resuelta:  'badge-success',
  concurso_iniciado:      'badge-info',
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function formatFechaHora(iso: string) {
  const fecha = formatFecha(iso)
  const hora  = new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${fecha} ${hora}`
}

export function NotificacionesPage() {
  const { user } = useAuth()
  const puedeVerAutorizaciones = can(user, 'autorizaciones', 'ver')
  // Solo para el aviso — el conteo real vive en el badge del header (S13-B).
  const { data: pendientes = 0 } = useAutorizacionesPendientes(puedeVerAutorizaciones)

  const [page, setPage]                 = useState(1)
  const [tipo, setTipo]                 = useState<TipoNotificacion | ''>('')
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)
  const [seleccionada, setSeleccionada] = useState<Notificacion | null>(null)

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

  function abrirNotificacion(n: Notificacion) {
    setSeleccionada(n)
    if (!n.leida) marcarLeida.mutate(n.id)
  }

  // Si la lista se refresca (ej: al marcar leída) mantener la modal sincronizada
  // con los datos frescos de la misma notificación en vez de mostrar el snapshot viejo.
  useEffect(() => {
    if (!seleccionada) return
    const actualizada = notificaciones.find((n) => n.id === seleccionada.id)
    if (actualizada && actualizada !== seleccionada) setSeleccionada(actualizada)
  }, [notificaciones, seleccionada])


  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* Header */}
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

      {/* S13-A: el panel de Autorizaciones (CPH + Alta de cargo) se unificó en
          /autorizaciones — ya no vive acá como pestaña aparte. La pestaña vieja
          resolvía CPH pegándole a POST /concursos-cph/:id/autorizar, que nunca
          tocaba la tabla `autorizaciones` nueva y dejaba filas huérfanas en
          "pendiente" — dejarla activa en paralelo a la página nueva reintroducía
          ese bug. */}
      {puedeVerAutorizaciones && (
        <Link
          to="/autorizaciones"
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm hover:bg-amber-100 transition-colors"
        >
          <span className="text-amber-500 text-lg">🔐</span>
          <span className="flex-1 text-amber-800 font-semibold">
            {pendientes > 0
              ? `Tenés ${pendientes} autorización${pendientes === 1 ? '' : 'es'} pendiente${pendientes === 1 ? '' : 's'} de resolver`
              : 'Ver autorizaciones pendientes'}
          </span>
          <span className="text-amber-600">→</span>
        </Link>
      )}

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
            onClick={() => abrirNotificacion(n)}
            className={`rounded-lg border p-4 flex gap-4 items-start transition-colors cursor-pointer hover:shadow-sm ${
              n.leida ? 'bg-white border-gray-200 hover:bg-gray-50' : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
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
              <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">{n.mensaje}</p>
            </div>
            {!n.leida && (
              <button
                className="text-xs text-blue-600 hover:underline shrink-0 mt-1"
                onClick={(e) => { e.stopPropagation(); marcarLeida.mutate(n.id) }}
                disabled={marcarLeida.isPending}
              >
                Marcar leída
              </button>
            )}
          </li>
        ))}
      </ul>

      {seleccionada && (
        <NotificacionDetalleModal notificacion={seleccionada} onClose={() => setSeleccionada(null)} />
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

// ── Modal de detalle ──────────────────────────────────────────────────────────

function NotificacionDetalleModal({ notificacion, onClose }: { notificacion: Notificacion; onClose: () => void }) {
  const { data: detalle, isLoading } = useNotificacionDetalle(notificacion.id)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`badge text-xs ${TIPO_BADGE[notificacion.tipo] ?? 'badge-info'}`}>
              {TIPO_LABELS[notificacion.tipo] ?? notificacion.tipo}
            </span>
            {!notificacion.leida && (
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="No leída" />
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          <h2 className="text-lg font-bold text-gray-900">{notificacion.titulo}</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{notificacion.mensaje}</p>

          {isLoading && <p className="text-xs text-gray-400">Cargando detalle…</p>}
          {!isLoading && detalle && <DetalleOrigen detalle={detalle} />}

          <dl className="pt-3 border-t border-gray-100 space-y-1.5">
            <div className="flex justify-between text-xs">
              <dt className="text-gray-400">Recibida</dt>
              <dd className="text-gray-600">{formatFechaHora(notificacion.creadaAt)}</dd>
            </div>
            <div className="flex justify-between text-xs">
              <dt className="text-gray-400">Estado</dt>
              <dd className="text-gray-600">
                {notificacion.leida
                  ? `Leída${notificacion.leidaAt ? ` — ${formatFechaHora(notificacion.leidaAt)}` : ''}`
                  : 'No leída'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ── Detalle del origen — lo concreto que pasó ─────────────────────────────────

function DetalleOrigen({ detalle }: { detalle: NotificacionDetalle }) {
  if (detalle.tipo === 'alta_cargo') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Cargo(s) creado(s) ({detalle.cargosCreados.length})
        </p>
        {detalle.cargosCreados.length === 0 ? (
          <p className="text-xs text-gray-400">No se encontraron los cargos creados.</p>
        ) : (
          <ul className="space-y-1.5">
            {detalle.cargosCreados.map((c) => (
              <li key={c.id} className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-gray-800">{c.codigo ?? '—'}</span>
                  <span className="text-gray-400">{c.hospital.sigla}</span>
                </div>
                <div className="text-gray-600 mt-0.5">
                  {c.literalPuesto ?? detalle.solicitud.literalPuesto}
                  {c.especialidadLegacy ? ` — ${c.especialidadLegacy}` : ''}
                </div>
                <div className="text-gray-400 mt-0.5">{c.escalafon.nombre}</div>
              </li>
            ))}
          </ul>
        )}
        {detalle.solicitud.expediente && (
          <p className="text-[11px] text-gray-400">Expediente: {detalle.solicitud.expediente}</p>
        )}
      </div>
    )
  }

  if (detalle.tipo === 'concurso_cph') {
    const { concurso } = detalle
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1 text-xs">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Concurso CPH</p>
        <div className="flex justify-between"><span className="text-gray-400">Cargo</span><span className="font-mono text-gray-700">{concurso.cargo.codigo ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Hospital</span><span className="text-gray-700">{concurso.hospital.sigla}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Puesto</span><span className="text-gray-700">{concurso.puestoSolicitado ?? concurso.cargo.literalPuesto ?? '—'}</span></div>
        {concurso.especialidadSolicitada && (
          <div className="flex justify-between"><span className="text-gray-400">Especialidad</span><span className="text-gray-700">{concurso.especialidadSolicitada}</span></div>
        )}
        <div className="flex justify-between"><span className="text-gray-400">Estado del concurso</span><span className="text-gray-700">{concurso.estadoConcurso}{concurso.subEstado ? ` — ${concurso.subEstado}` : ''}</span></div>
      </div>
    )
  }

  if (detalle.tipo === 'concurso_ceetps') {
    const { concurso } = detalle
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1 text-xs">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Concurso CEETPS</p>
        <div className="flex justify-between"><span className="text-gray-400">Cargo</span><span className="font-mono text-gray-700">{concurso.cargo.codigo ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Hospital</span><span className="text-gray-700">{concurso.hospital.sigla}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Estado del concurso</span><span className="text-gray-700">{concurso.estadoConcurso}</span></div>
      </div>
    )
  }

  // baja
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1 text-xs">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Baja</p>
      <div className="flex justify-between"><span className="text-gray-400">Cargo</span><span className="font-mono text-gray-700">{detalle.cargo.codigo ?? '—'}</span></div>
      <div className="flex justify-between"><span className="text-gray-400">Hospital</span><span className="text-gray-700">{detalle.hospital.sigla}</span></div>
      {detalle.persona && (
        <div className="flex justify-between"><span className="text-gray-400">Persona</span><span className="text-gray-700">{detalle.persona.apellidoNombre}</span></div>
      )}
      <div className="flex justify-between"><span className="text-gray-400">Fecha de baja</span><span className="text-gray-700">{formatFecha(detalle.fechaBaja)}</span></div>
      {detalle.motivo && (
        <div className="flex justify-between"><span className="text-gray-400">Motivo</span><span className="text-gray-700">{detalle.motivo}</span></div>
      )}
    </div>
  )
}
