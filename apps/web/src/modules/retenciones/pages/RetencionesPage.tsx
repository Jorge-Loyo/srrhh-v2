import { useState } from 'react'
import { ValidacionRetencionesPage } from './ValidacionRetencionesPage'
import { RetencionesListaPage } from './RetencionesListaPage'

// Vista de Retenciones con dos pestañas:
//  - Validación: personas con 2+ cargos activos sin retención/comisión formalizada
//    (donde se registra una retención).
//  - Retenciones: cargos ya retenidos (situacionRevista = 'Retencion de Cargo').
type Tab = 'validacion' | 'retenidos'

export function RetencionesPage() {
  const [tab, setTab] = useState<Tab>('validacion')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'validacion', label: 'Validación' },
    { key: 'retenidos', label: 'Retenciones' },
  ]

  return (
    <div className="space-y-4">
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

      {tab === 'validacion' ? <ValidacionRetencionesPage /> : <RetencionesListaPage />}
    </div>
  )
}
