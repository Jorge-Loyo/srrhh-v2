import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Baja, BajaFilters, PaginatedResponse } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { apiClient } from '@/shared/lib/api-client'

const ESTADO_CLASSES: Record<string, string> = {
  resolucion_a_la_firma: 'badge-default',
  pendiente:  'badge-warning',
  confirmada: 'badge-success',
  anulada:    'badge-danger',
}

function fmtEstado(s: string) {
  return s.replace(/_/g, ' ')
}

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-AR')
}

function RowDetalle({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-44 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-800">{value ?? '—'}</span>
    </div>
  )
}

function ModalDetalleBaja({ baja, onClose }: { baja: Baja; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-primary text-base font-bold text-gray-900">Detalle de Baja</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cargo</p>
            <RowDetalle label="Código" value={<span className="font-mono text-xs">{baja.cargo?.codigo}</span>} />
            <RowDetalle label="Puesto" value={baja.cargo?.literalPuesto} />
            <RowDetalle label="Escalafón" value={baja.cargo?.escalafon?.nombre} />
            <RowDetalle label="Hospital" value={
              baja.cargo?.hospital
                ? `${baja.cargo.hospital.sigla} — ${baja.cargo.hospital.nombre}`
                : baja.hospital?.sigla
            } />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Persona</p>
            <RowDetalle label="Apellido y Nombre" value={baja.persona?.apellidoNombre} />
            <RowDetalle label="CUIL" value={baja.persona?.cuil} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Datos de la Baja</p>
            <RowDetalle label="Fecha de Baja" value={fmtFecha(baja.fechaBaja)} />
            <RowDetalle label="Motivo" value={baja.motivo} />
            <RowDetalle label="Tipo de Baja" value={baja.tipoBaja} />
            <RowDetalle label="Tipificador Origen" value={baja.tipificadorOrigen} />
            <RowDetalle label="Estado" value={
              <span className={ESTADO_CLASSES[baja.estado] ?? 'badge-default'}>{fmtEstado(baja.estado)}</span>
            } />
            <RowDetalle label="Genera Concurso" value={
              baja.generaConcurso
                ? <span className="badge-info">Sí</span>
                : <span className="badge-default">No</span>
            } />
            {baja.observaciones && <RowDetalle label="Observaciones" value={baja.observaciones} />}
            <RowDetalle label="Registrado por" value={baja.registradoPor?.username} />
            <RowDetalle label="Fecha de registro" value={fmtFecha(baja.createdAt)} />
          </div>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-200">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

const LIMIT = 50

function useBajas(filters: BajaFilters) {
  return useQuery({
    queryKey: ['bajas', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Baja>>('/api/v1/bajas', { params: filters })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export function BajaCargosPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puedeCrear = can(user, 'bajas', 'crear')

  const [search,     setSearch]     = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [estado,     setEstado]     = useState('')
  const [page,       setPage]       = useState(1)
  const [bajaSeleccionada, setBajaSeleccionada] = useState<Baja | null>(null)
  const searchDebounced = useDebounce(search, 300)

  const filters = {
    page, limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId      && { hospitalId }),
    ...(estado          && { estado }),
  }
  const { data, isLoading, isFetching, isError } = useBajas(filters)
  const { data: hospitales } = useHospitales()

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Baja de Cargos</h1>
          {puedeCrear && (
            <button className="btn-danger" onClick={() => navigate('/cargos/baja/nueva?sinConcurso=1')}>
              + Nueva Baja
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <input type="text" placeholder="Buscar por código de cargo, persona, motivo..."
            value={search} onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
          <select value={hospitalId} onChange={(e) => resetPage(setHospitalId)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary">
            <option value="">Todos los hospitales</option>
            {hospitales?.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
          </select>
          <select value={estado} onChange={(e) => resetPage(setEstado)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary">
            <option value="">Todos los estados</option>
            <option value="resolucion_a_la_firma">Resolución a la firma</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando bajas...</p>}
        {isError   && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de bajas.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para los filtros aplicados.</p>
            )}
            {data.data.length > 0 && (
              <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Código Cargo</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Hospital</th>
                    <th className="px-4 py-3 font-semibold">Persona</th>
                    <th className="px-4 py-3 font-semibold">Motivo</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtFecha(b.fechaBaja)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-800">{b.cargo?.codigo ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.cargo?.literalPuesto ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.cargo?.hospital?.sigla ?? b.hospital?.sigla ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.persona?.apellidoNombre ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.motivo ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={ESTADO_CLASSES[b.estado] ?? 'badge-default'}>
                          {fmtEstado(b.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(b.estado as string) === 'resolucion_a_la_firma' ? (
                          <button
                            className="btn-primary text-xs"
                            onClick={() => navigate(`/cargos/baja/${b.id}/editar?sinConcurso=1`)}
                          >
                            ✏️ Editar
                          </button>
                        ) : (
                          <button
                            className="btn-outline text-xs"
                            onClick={() => setBajaSeleccionada(b)}
                          >
                            Ver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total</span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={page >= data.meta.pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
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
