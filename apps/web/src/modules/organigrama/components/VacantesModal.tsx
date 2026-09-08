import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { tipoColor } from '../lib/organigramaHelpers'
import type { Vacante } from '../lib/organigramaHelpers'

function groupByRegimen(vacantes: Vacante[]): [string, Vacante[]][] {
  const map = new Map<string, Vacante[]>()
  vacantes.forEach((v) => {
    const key = v.regimenEmpleo || 'Sin Régimen'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(v)
  })
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
}

interface Props {
  open: boolean
  onClose: () => void
  vacantes: Vacante[]
  sigla: string
  onSelect: (v: Vacante) => void
}

// Lista de todos los puestos sin persona asignada ("Vacante") del organigrama
// actual, agrupados por régimen de empleo, cada uno con su camino jerárquico
// para dar contexto.
export default function VacantesModal({ open, onClose, vacantes, sigla, onSelect }: Props) {
  if (!open) return null

  const handleSelect = (v: Vacante) => {
    onSelect(v)
    onClose()
  }

  const groups = groupByRegimen(vacantes)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 rounded-t-2xl bg-gradient-to-r from-amber-600 to-amber-500 border-b-2 border-amber-700 shrink-0">
          <span className="text-white font-bold text-base tracking-wide flex items-center gap-2">
            <ExclamationTriangleIcon className="w-5 h-5" />
            Vacantes — {sigla} ({vacantes.length})
          </span>
          <button onClick={onClose} className="p-1 rounded text-white/80 hover:bg-white/15 hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 px-4 py-4 overflow-y-auto flex-1">
          {vacantes.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No hay vacantes para este hospital.</p>
          ) : (
            <div className="space-y-5">
              {groups.map(([regimen, items]) => (
                <div key={regimen}>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    {regimen} <span className="text-gray-400 font-semibold normal-case">({items.length})</span>
                  </h3>
                  <ul className="space-y-2.5">
                    {items.map((v) => (
                      <li
                        key={v.id}
                        onClick={() => handleSelect(v)}
                        className="bg-white border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:border-amber-300 hover:bg-amber-50/50 transition-colors"
                      >
                        {v.path.length > 0 && <p className="text-xs text-gray-600 font-medium leading-snug mb-1.5">{v.path.join(' › ')}</p>}
                        <div className="flex items-start gap-2.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5 ${tipoColor(v.tipo)}`}>{v.tipo}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 leading-tight">{v.nombre}</p>
                            {v.id && <span className="inline-block text-[11px] font-mono font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded mt-1">{v.id}</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
