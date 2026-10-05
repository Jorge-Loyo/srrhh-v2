import { useState } from 'react'
import { LibreTab } from '../components/LibreTab'
import { EvolutivoEspecialidadTab } from '../components/EvolutivoEspecialidadTab'

// Cada solapa acá replica un reporte puntual (misma idea que las solapas del
// Excel de presupuesto de dotación) — "Libre" es el constructor genérico
// (elegís filtros + dimensiones), las demás son reportes fijos con su propia
// lógica. Se van sumando de a una a medida que se define cada reporte.
const TABS = [
  { key: 'libre', label: 'Libre' },
  { key: 'evolutivo-especialidad', label: 'Evolutivo por Especialidad' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function ReportesPage() {
  const [tab, setTab] = useState<TabKey>('libre')

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 pt-4">
        <h1 className="font-primary text-xl font-bold text-gray-900 mb-3">Reportes</h1>
        <div className="flex gap-1 -mb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-secondary text-secondary'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'libre' && <LibreTab />}
      {tab === 'evolutivo-especialidad' && <EvolutivoEspecialidadTab />}
    </div>
  )
}
