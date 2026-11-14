import { useState } from 'react'
import { JuradosTab } from '../components/JuradosTab'
import { OrdenesMeritoTab } from '../components/OrdenesMeritoTab'
import { JornadasSorteoTab } from '../components/JornadasSorteoTab'
import { ConcursosListaTab } from '../components/ConcursosListaTab'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { ConcursoCph, ConcursoCphFilters, PaginatedResponse } from '@srrhh/types'

// Hook para /concursos/cph: CPH que ya superaron Etapa 1 (tipo='cph' activa
// soloEtapa1Superada en el backend). Misma firma que useConcursosCph.
function useConcursosCphEtapa2(filters: ConcursoCphFilters) {
  return useQuery({
    queryKey: ['concursos-cph-etapa2', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<ConcursoCph>>(
        '/api/v1/concursos/bandeja-gestion',
        { params: { ...filters, tipo: 'cph' } },
      )
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

type TabId = 'concursos' | 'jurados' | 'ordenes' | 'jornadas'

export function ConcursosCphPage() {
  const { user } = useAuth()
  const [tabRaw, setTab] = useState<TabId>('concursos')
  const TAB_SLUG: Record<TabId, string> = {
    concursos: 'concursos',
    jurados: 'jurados',
    ordenes: 'ordenes-merito',
    jornadas: 'jornadas-sorteo',
  }
  const todasLasTabs: { id: TabId; label: string }[] = [
    { id: 'concursos', label: 'Concursos' },
    { id: 'jurados', label: 'Jurados' },
    { id: 'ordenes', label: 'Órdenes de mérito' },
    { id: 'jornadas', label: 'Jornada de sorteos' },
  ]
  const tabs = todasLasTabs.filter((t) => can(user, 'concursos-cph', `tab:${TAB_SLUG[t.id]}`))
  const tab = tabs.some((t) => t.id === tabRaw) ? tabRaw : tabs[0]?.id
  if (!user) return <div className="p-8 text-sm text-gray-400">Cargando...</div>
  if (tabs.length === 0) {
    return <div className="p-8 text-sm text-gray-500">Sin acceso a ninguna pestaña.</div>
  }
  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.id
                ? 'border-secondary text-secondary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'concursos' && (
        <ConcursosListaTab
          titulo="Concursos CPH"
          descripcion="Concursos CPH en Etapa 2 en adelante (autorizados por SGRASV)."
          useData={useConcursosCphEtapa2}
          columnaRespaldatoria="concurso"
          ocultarEtapa1
        />
      )}
      {tab === 'jurados' && <JuradosTab />}
      {tab === 'ordenes' && <OrdenesMeritoTab />}
      {tab === 'jornadas' && <JornadasSorteoTab />}
    </div>
  )
}
