import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseIcon, ArrowRightIcon, ExclamationTriangleIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { useVacantesConduccion, useCargosConduccionHuerfanos } from '../hooks/useOrganigrama'

// S24-9: panel de KPI de vacantes de conducción (jefaturas sin ocupante activo).
// Total global + desglose por nivel jerárquico + top efectores con más vacantes.
// Cada hospital navega a su organigrama. Consume GET /organigrama/vacantes.

const NIVEL_COLOR: Record<string, string> = {
  'Autoridad Superior': 'bg-purple-100 text-purple-700',
  'Dirección': 'bg-red-100 text-red-700',
  'Subdirección': 'bg-orange-100 text-orange-700',
  'Jefatura': 'bg-amber-100 text-amber-700',
  'Gerencia': 'bg-sky-100 text-sky-700',
}

export default function KpiVacantesPanel() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useVacantesConduccion()
  const { data: huerfanos } = useCargosConduccionHuerfanos()
  const [verFrias, setVerFrias] = useState(false)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 animate-pulse">
        <div className="h-4 w-40 bg-amber-200/70 rounded" />
      </div>
    )
  }
  if (isError || !data) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-4 py-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2">
            <BriefcaseIcon className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700/80">
              Vacantes de conducción
            </p>
            <p className="text-2xl font-bold text-gray-900 leading-tight">{data.total}</p>
            <p className="text-xs text-gray-500">
              {data.conPersonalActivo} con personal ·{' '}
              {data.frias > 0 ? (
                <button
                  onClick={() => setVerFrias((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-amber-700 hover:text-amber-800 font-semibold hover:underline"
                  title="Ver las vacantes frías para revisión de RRHH"
                >
                  {data.frias} sin personal (frías)
                  <ChevronDownIcon className={`w-3 h-3 transition-transform ${verFrias ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <span>{data.frias} sin personal (frías)</span>
              )}
            </p>
          </div>
        </div>

        {/* Desglose por nivel */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {data.porNivel.map((n) => (
            <span
              key={n.nivel}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${NIVEL_COLOR[n.nivel] ?? 'bg-gray-100 text-gray-600'}`}
              title={`${n.total} vacante(s) de ${n.nivel}`}
            >
              {n.nivel}
              <span className="font-bold">{n.total}</span>
            </span>
          ))}
        </div>
      </div>

      {/* S24-3: lista de vacantes "frías" (nodo sin personal activo) para que
          RRHH las revise/valide. Se despliega al clickear el contador. */}
      {verFrias && (
        <div className="mt-3 pt-3 border-t border-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Vacantes frías para revisión de RRHH ({data.frias})
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {data.vacantes
              .filter((v) => v.frio)
              .map((v) => (
                <button
                  key={v.cargoId}
                  onClick={() => navigate(`/cargos/${v.cargoId}`)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-amber-50 hover:border-amber-200 transition-colors text-left"
                  title={v.revisionMotivo ?? 'Ver cargo'}
                >
                  <span className="font-mono text-[11px] font-bold text-amber-700 w-28 flex-shrink-0 truncate">{v.codigo}</span>
                  <span className="font-mono text-[10px] text-gray-400 w-12 flex-shrink-0">{v.hospitalSigla}</span>
                  <span className="text-xs text-gray-700 flex-1 truncate">{v.descripcionRepa ?? v.codigoRepa ?? '—'}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${NIVEL_COLOR[v.nivel] ?? 'bg-gray-100 text-gray-600'}`}>{v.nivel}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Top efectores con más vacantes */}
      {data.porHospital.length > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Efectores con más vacantes
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {data.porHospital.slice(0, 9).map((h) => (
              <button
                key={h.sigla}
                onClick={() => navigate(`/organigrama/${h.sigla.toUpperCase()}`)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-amber-50 hover:border-amber-200 transition-colors text-left"
                title={h.nombre}
              >
                <span className="font-mono text-xs font-bold text-amber-700 w-14 flex-shrink-0">{h.sigla}</span>
                <span className="text-xs text-gray-700 flex-1 truncate">{h.nombre}</span>
                <span className="text-xs font-bold text-gray-900 bg-amber-100 px-1.5 rounded">{h.total}</span>
                <ArrowRightIcon className="w-3 h-3 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* S24-7: aviso de cargos huérfanos (nodo eliminado del árbol) para RRHH */}
      {huerfanos && huerfanos.total > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-100">
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              <span className="font-semibold">{huerfanos.total} cargo(s) de conducción huérfano(s):</span>{' '}
              generados desde el organigrama cuya repartición ya no existe en el árbol actual (nodo
              eliminado en un re-upload). Revisar con RRHH si corresponde darlos de baja.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
