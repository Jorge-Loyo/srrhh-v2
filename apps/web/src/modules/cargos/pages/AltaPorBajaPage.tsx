import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { Baja, ConcursoCph, PaginatedResponse } from '@srrhh/types'

const ESTADO_CLASSES: Record<string, string> = {
  pendiente:  'badge-warning',
  confirmada: 'badge-success',
  anulada:    'badge-danger',
}

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-AR')
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-44 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-800">{value ?? '—'}</span>
    </div>
  )
}

function ModalDetalleBaja({
  baja,
  onClose,
}: {
  baja: Baja
  onClose: () => void
}) {
  const navigate = useNavigate()

  const { data: cphData, isLoading: cphLoading } = useQuery({
    queryKey: ['concurso-cph-by-cargo', baja.cargoId],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<ConcursoCph>>('/api/v1/concursos-cph', {
        params: { cargoId: baja.cargoId, limit: 1 },
      })
      return res.data.data[0] ?? null
    },
    enabled: baja.generaConcurso,
  })

  const irAlConcurso = () => {
    if (cphData) {
      onClose()
      navigate(`/concursos/cph/${cphData.id}/wizard`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-primary text-base font-bold text-gray-900">Detalle de Baja</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">

          {/* Cargo */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cargo</p>
            <Row label="Código" value={<span className="font-mono text-xs">{baja.cargo?.codigo}</span>} />
            <Row label="Puesto" value={baja.cargo?.literalPuesto} />
            <Row label="Escalafón" value={baja.cargo?.escalafon?.nombre} />
            <Row label="Hospital" value={
              baja.cargo?.hospital
                ? `${baja.cargo.hospital.sigla} — ${baja.cargo.hospital.nombre}`
                : baja.hospital?.sigla
            } />
          </div>

          {/* Persona */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Persona</p>
            <Row label="Apellido y Nombre" value={baja.persona?.apellidoNombre} />
            <Row label="CUIL" value={baja.persona?.cuil} />
          </div>

          {/* Baja */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Datos de la Baja</p>
            <Row label="Fecha de Baja" value={fmtFecha(baja.fechaBaja)} />
            <Row label="Motivo" value={baja.motivo} />
            <Row label="Tipo de Baja" value={baja.tipoBaja} />
            <Row label="Tipificador Origen" value={baja.tipificadorOrigen} />
            <Row label="Estado" value={
              <span className={ESTADO_CLASSES[baja.estado] ?? 'badge-default'}>{baja.estado}</span>
            } />
            <Row label="Genera Concurso" value={
              baja.generaConcurso
                ? <span className="badge-info">Sí</span>
                : <span className="badge-default">No</span>
            } />
            {baja.observaciones && (
              <Row label="Observaciones" value={baja.observaciones} />
            )}
            <Row label="Registrado por" value={baja.registradoPor?.username} />
            <Row label="Fecha de registro" value={fmtFecha(baja.createdAt)} />
          </div>

          {/* Concurso CPH vinculado */}
          {baja.generaConcurso && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Concurso CPH</p>
              {cphLoading && <p className="text-sm text-gray-400">Buscando concurso...</p>}
              {!cphLoading && !cphData && (
                <p className="text-sm text-gray-400">No se encontró concurso asociado.</p>
              )}
              {cphData && (
                <>
                  <Row label="Estado" value={cphData.estado} />
                  <Row label="Sub-estado" value={cphData.subEstado} />
                  {cphData.especialidadSolicitada && (
                    <Row label="Especialidad" value={cphData.especialidadSolicitada} />
                  )}
                  {cphData.fechaAutorizacion && (
                    <Row label="Fecha Autorización" value={fmtFecha(cphData.fechaAutorizacion)} />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
          {baja.generaConcurso && cphData && (
            <button className="btn-primary" onClick={irAlConcurso}>
              Ver estado del concurso →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function AltaPorBajaPage() {
  const [search, setSearch] = useState('')
  const [bajaSeleccionada, setBajaSeleccionada] = useState<Baja | null>(null)
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bajas', search],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Baja>>('/api/v1/bajas', {
        params: { limit: 50, ...(search.length >= 2 && { search }) },
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Alta por Baja</h1>
          <button className="btn-outline" onClick={() => navigate('/cargos/baja/nueva')}>
            + Nueva Baja
          </button>
        </div>

        <input
          type="text"
          placeholder="Buscar por código de cargo, persona, motivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando bajas...</p>}
        {isError   && <p className="p-6 text-sm text-danger">No se pudo cargar el listado.</p>}

        {!isLoading && !isError && (data?.data.length ?? 0) === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">
            {search ? 'Sin resultados para la búsqueda.' : 'No hay bajas registradas aún.'}
          </p>
        )}

        {!isLoading && !isError && (data?.data.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Código Cargo</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Persona</th>
                <th className="px-4 py-3 font-semibold">Motivo</th>
                <th className="px-4 py-3 font-semibold">Concurso</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.data.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {fmtFecha(b.fechaBaja)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">
                    {b.cargo?.codigo ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.cargo?.literalPuesto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.cargo?.hospital?.sigla ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.persona?.apellidoNombre ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.motivo ?? '—'}</td>
                  <td className="px-4 py-3">
                    {b.generaConcurso
                      ? <span className="badge-info">Sí</span>
                      : <span className="badge-default">No</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={ESTADO_CLASSES[b.estado] ?? 'badge-default'}>
                      {b.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="btn-outline text-xs"
                      onClick={() => setBajaSeleccionada(b)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bajaSeleccionada && (
        <ModalDetalleBaja
          baja={bajaSeleccionada}
          onClose={() => setBajaSeleccionada(null)}
        />
      )}
    </div>
  )
}
