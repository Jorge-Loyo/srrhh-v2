import { useState } from 'react'
import { ValidacionBajasPage } from './ValidacionBajasPage'
import { BajaVinculacionPage } from './BajaVinculacionPage'

// Consolida en una sola vista con pestañas lo que antes eran dos entradas de
// menú: "Validación de Bajas" (resolver cargos en validación vacante) y
// "Vinculación de Bajas" (seguimiento de bajas respaldadas por el padrón).
type Tab = 'validacion' | 'vinculacion'

export function ValidacionYVinculacionPage() {
  const [tab, setTab] = useState<Tab>('validacion')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'validacion', label: 'Validación' },
    { key: 'vinculacion', label: 'Vinculación' },
  ]

  return (
    <div className="space-y-4">
      {/* Pestañas de primer nivel */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'validacion' ? <ValidacionBajasPage /> : <BajaVinculacionPage />}
    </div>
  )
}
