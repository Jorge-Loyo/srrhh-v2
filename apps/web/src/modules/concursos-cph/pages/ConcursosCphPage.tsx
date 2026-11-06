import { useState } from 'react'
import { JuradosTab } from '../components/JuradosTab'
import { OrdenesMeritoTab } from '../components/OrdenesMeritoTab'
import { JornadasSorteoTab } from '../components/JornadasSorteoTab'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { can } from '@/shared/lib/can'

// PASO 1b (flujo concursos): la pestaña "Concursos" (listado principal con la
// tabla COMPLETA) se MUDÓ a /cargos/concurso ("Gestión de Concursos"), que
// reutiliza ConcursosListaTab (ver apps/web/.../components/ConcursosListaTab.tsx).
// Acá queda el contenedor con las 3 pestañas restantes: Jurados / Órdenes de
// mérito / Jornada de sorteos. El permiso concursos-cph/tab:concursos quedó
// huérfano (sin UI) — NO se borra de la BD, solo deja de usarse.
type TabId = 'jurados' | 'ordenes' | 'jornadas'

// Contenedor con pestañas: Jurados | Órdenes de mérito | Jornada de sorteos.
export function ConcursosCphPage() {
  const { user } = useAuth()
  const [tabRaw, setTab] = useState<TabId>('jurados')
  // Permiso concursos-cph/tab:<slug> por pestaña (solo visibilidad de UI).
  const TAB_SLUG: Record<TabId, string> = {
    jurados: 'jurados',
    ordenes: 'ordenes-merito',
    jornadas: 'jornadas-sorteo',
  }
  const todasLasTabs: { id: TabId; label: string }[] = [
    { id: 'jurados', label: 'Jurados' },
    { id: 'ordenes', label: 'Órdenes de mérito' },
    { id: 'jornadas', label: 'Jornada de sorteos' },
  ]
  const tabs = todasLasTabs.filter((t) => can(user, 'concursos-cph', `tab:${TAB_SLUG[t.id]}`))
  // Si la pestaña actual no es visible, cae en la primera visible.
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

      {tab === 'jurados' && <JuradosTab />}
      {tab === 'ordenes' && <OrdenesMeritoTab />}
      {tab === 'jornadas' && <JornadasSorteoTab />}
    </div>
  )
}
