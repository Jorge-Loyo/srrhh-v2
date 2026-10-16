import { useState } from 'react'
import { EvolucionDotacionChart } from '../components/EvolucionDotacionChart'
import { EvolucionEspecialidadChart } from '../components/EvolucionEspecialidadChart'
import { useKpiDotacionHistorica } from '../hooks/useReportes'

export function ReportesPage() {
  // La sección "Evolución de dotación" y sus datos se mudaron desde el Tablero
  // de KPIs. Arranca colapsada; se despliega al tocar el encabezado.
  const [abierto, setAbierto] = useState(false)

  // Nota: por las reglas de hooks, `useKpiDotacionHistorica` se invoca siempre
  // en el cuerpo del componente, así que la query de dotación histórica se
  // dispara al montar la página aunque la sección esté colapsada (mismo
  // comportamiento efectivo que tenía KpisPage). Las queries pesadas de
  // `EvolucionEspecialidadChart` (`useDotacionEvolucion` con `enabled`) quedan
  // diferidas porque ese componente solo se monta al expandir.
  const { data: historica, isLoading: loadingHistorica } = useKpiDotacionHistorica()

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h1 className="font-primary text-xl font-bold text-gray-900">Reportes</h1>
      </div>

      {/* ── Evolución de dotación (colapsable) — mudado desde el Tablero de KPIs ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="w-full flex items-center justify-between gap-3 p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-lg"
        >
          <h2 className="font-primary text-base font-bold text-gray-900">Evolución de dotación</h2>
          <svg
            className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
        {abierto && (
          <div className="px-6 pb-6 space-y-6">
            {/* ── Evolución de la dotación histórica ────────────────────── */}
            <div>
              <h3 className="font-primary text-base font-bold text-gray-900 mb-1">Evolución de la dotación</h3>
              <p className="text-xs text-gray-400 mb-4">Personas únicas por fecha de padrón aprobada</p>
              {loadingHistorica ? (
                <div className="h-64 bg-gray-100 rounded animate-pulse" />
              ) : (
                <EvolucionDotacionChart data={historica} />
              )}
            </div>

            {/* ── Evolución por Carrera → Puesto → Especialidad ─────────── */}
            <div>
              <h3 className="font-primary text-base font-bold text-gray-900 mb-1">Evolución por carrera y especialidad</h3>
              <p className="text-xs text-gray-400 mb-4">
                Personas activas (situación de revista) por mes — último padrón de cada mes
              </p>
              <EvolucionEspecialidadChart />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
