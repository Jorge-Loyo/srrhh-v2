import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { Baja, ConcursoCph, PaginatedResponse } from '@srrhh/types'

// Opciones de origen que ofrece el modal de "Gestión de Cargos". Cada una
// abre el mismo formulario de baja con el origen fijado y bloqueado. El texto
// explicativo es editable por negocio (placeholders a confirmar con Jorge).
const ORIGENES_GESTION = [
  {
    valor: 'Alta por Baja',
    titulo: 'Alta por Baja',
    desc: 'La persona se da de baja del cargo y se genera un concurso para cubrir la vacante que deja. [descripción a confirmar]',
  },
  {
    valor: 'Retención de Cargo',
    titulo: 'Retención de Cargo',
    desc: 'La persona deja la función pero retiene su cargo. [descripción a confirmar]',
  },
  {
    valor: 'Cobertura Dotación',
    titulo: 'Cobertura de Dotación',
    desc: 'Se cubre una vacante de dotación existente. [descripción a confirmar]',
  },
] as const

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
            <Row label="Carrera" value={baja.cargo?.escalafon?.nombre} />
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
              <span className={ESTADO_CLASSES[baja.estado] ?? 'badge-default'}>{fmtEstado(baja.estado)}</span>
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
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [bajaSeleccionada, setBajaSeleccionada] = useState<Baja | null>(null)
  const [modalOrigenAbierto, setModalOrigenAbierto] = useState(false)
  const navigate = useNavigate()

  function elegirOrigen(valor: string) {
    setModalOrigenAbierto(false)
    navigate(`/cargos/baja/nueva?origen=${encodeURIComponent(valor)}`)
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bajas', search, estadoFiltro],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Baja>>('/api/v1/bajas', {
        params: {
          limit: 50,
          ...(search.length >= 2 && { search }),
          ...(estadoFiltro && { estado: estadoFiltro }),
        },
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
          <button className="btn-outline" onClick={() => setModalOrigenAbierto(true)}>
            Gestión de Cargos
          </button>
        </div>

        {modalOrigenAbierto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setModalOrigenAbierto(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-primary text-lg font-bold text-gray-900">Gestión de Cargos</h2>
                <button
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  onClick={() => setModalOrigenAbierto(false)}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-500">Elegí el origen de la gestión. Cada uno tiene su propia lógica.</p>
              <div className="space-y-3">
                {ORIGENES_GESTION.map((o) => (
                  <button
                    key={o.valor}
                    onClick={() => elegirOrigen(o.valor)}
                    className="w-full text-left border border-gray-200 rounded-lg p-4 hover:border-secondary hover:bg-secondary/5 transition-colors"
                  >
                    <div className="font-semibold text-gray-900">{o.titulo}</div>
                    <div className="text-sm text-gray-500 mt-1">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Buscar por código de cargo, persona, motivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded w-56 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los estados</option>
            <option value="resolucion_a_la_firma">Borradores (resolución a la firma)</option>
            <option value="confirmada">Confirmada</option>
            <option value="anulada">Anulada</option>
          </select>
        </div>
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
                      {fmtEstado(b.estado)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(b.estado as string) === 'resolucion_a_la_firma' ? (
                      <button
                        className="btn-primary text-xs"
                        onClick={() => navigate(`/cargos/baja/${b.id}/editar`)}
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
