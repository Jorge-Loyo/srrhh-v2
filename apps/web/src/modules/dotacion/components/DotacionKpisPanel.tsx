import { useState } from 'react'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { useDotacionKpis } from '../hooks/useDotacion'

const SIT_COLORS: Record<string, string> = {
  Activo: 'bg-green-500',
  'Retención de Cargo': 'bg-orange-400',
  Comisión: 'bg-blue-400',
}

function MiniBar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-1.5 rounded-full ${className}`} style={{ width: `${Math.max(1, pct)}%` }} />
    </div>
  )
}

interface DotacionKpisPanelProps {
  sigla: string
  onFilterSigla: (sigla: string) => void
  estado: string
  onFilterEstado: (estado: string) => void
}

// Mapea la card clickeada al literal real de o.situacion_revista que espera
// el filtro `estado` de GET /dotacion (ver dotacion.service.ts).
const ESTADO_POR_CARD: Record<string, string> = {
  Activos: 'Activo',
  Retención: 'Retención de Cargo',
  Comisión: 'Comisión',
}

// Panel de KPIs de la pantalla Dotación — composición del personal activo
// (no confundir con /kpis que mide cargos vigentes/vacantes, ver
// dotacion.service.ts:getDotacionKpisService). Filtra por hospitalId (no por
// sigla directamente, GET /dotacion/kpis lo pide así), por eso resuelve el
// id a partir de la sigla elegida en la tabla.
export function DotacionKpisPanel({ sigla, onFilterSigla, estado, onFilterEstado }: DotacionKpisPanelProps) {
  const [open, setOpen] = useState(true)
  const { data: hospitales } = useHospitales()
  const hospitalId = hospitales?.find((h) => h.sigla === sigla)?.id
  const { data, isLoading } = useDotacionKpis(hospitalId)

  const g = data?.globales
  const total = g?.total || 1

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Panel de KPIs</span>
        <svg aria-hidden="true" className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M7.21 14.77a.75.75 0 01.02-1.06L11.94 10 7.23 5.29a.75.75 0 111.06-1.06l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.08-.02z" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Efector:</span>
            <select
              value={sigla}
              onChange={(e) => onFilterSigla(e.target.value)}
              className="h-8 px-2 border border-gray-300 rounded text-xs w-48 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Todos</option>
              {(data?.porEfector ?? []).map((r) => (
                <option key={r.sigla} value={r.sigla}>{r.sigla}</option>
              ))}
            </select>
            {sigla && (
              <button onClick={() => onFilterSigla('')} className="text-xs text-danger hover:underline">
                Quitar
              </button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400">Cargando...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Total', val: g?.total, cls: 'bg-gray-50 text-gray-800' },
                    { label: 'Activos', val: g?.activos, cls: 'bg-green-50 text-green-700' },
                    { label: 'Retención', val: g?.retencion, cls: 'bg-orange-50 text-orange-700' },
                    { label: 'Comisión', val: g?.comision, cls: 'bg-blue-50 text-blue-700' },
                    { label: 'Mujeres', val: g?.mujeres, cls: 'bg-pink-50 text-pink-700' },
                    { label: 'Varones', val: g?.varones, cls: 'bg-sky-50 text-sky-700' },
                  ].map(({ label, val, cls }) => {
                    const estadoValue = ESTADO_POR_CARD[label]
                    const clickable = estadoValue !== undefined
                    const active = clickable && estado === estadoValue
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={!clickable}
                        onClick={() => clickable && onFilterEstado(active ? '' : estadoValue)}
                        className={`text-left rounded-lg px-3 py-2 ${cls} ${clickable ? 'cursor-pointer transition-shadow' : 'cursor-default'} ${active ? 'ring-2 ring-secondary' : ''}`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</p>
                        <p className="text-lg font-bold">{(val ?? 0).toLocaleString('es-AR')}</p>
                      </button>
                    )
                  })}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Situación de revista</p>
                  <div className="flex rounded-full overflow-hidden h-3">
                    {(data?.porSitRevista ?? []).map((r) => (
                      <div
                        key={r.situacion}
                        style={{ width: `${(r.total / total) * 100}%` }}
                        className={`${SIT_COLORS[r.situacion] ?? 'bg-gray-300'} transition-all`}
                        title={`${r.situacion}: ${r.total.toLocaleString('es-AR')}`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {(data?.porSitRevista ?? []).map((r) => (
                      <span key={r.situacion} className="text-[10px] text-gray-500 flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${SIT_COLORS[r.situacion] ?? 'bg-gray-300'}`} />
                        {r.situacion} ({((r.total / total) * 100).toFixed(1)}%)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Por escalafón</p>
                <div className="space-y-1.5">
                  {(data?.porEscalafon ?? []).map((r) => (
                    <div key={r.escalafonId}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-600 truncate max-w-[160px]">{r.escalafon}</span>
                        <span className="text-gray-500 font-medium ml-2">{r.total.toLocaleString('es-AR')}</span>
                      </div>
                      <MiniBar pct={(r.total / total) * 100} className="bg-secondary" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Top efectores</p>
                <div className="space-y-1.5">
                  {(data?.porEfector ?? []).slice(0, 10).map((r) => (
                    <div key={r.hospitalId}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <button onClick={() => onFilterSigla(r.sigla)} className="text-secondary hover:underline font-medium">
                          {hospitales ? hospitalLabel(hospitales.find((h) => h.id === r.hospitalId) ?? { sigla: r.sigla, nombre: r.sigla }) : r.sigla}
                        </button>
                        <span className="text-gray-500 font-medium ml-2">{r.total.toLocaleString('es-AR')}</span>
                      </div>
                      <MiniBar pct={(r.total / total) * 100} className="bg-primary" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
