import { useState } from 'react'
import { EvolucionDotacionChart } from '../components/EvolucionDotacionChart'
import { EvolucionEspecialidadChart } from '../components/EvolucionEspecialidadChart'
import { useKpiDotacionHistorica } from '../hooks/useReportes'
import { SlidesViewer } from '@/modules/presentacion/components/SlidesViewer'
import { SLIDES_CATALOGO } from '@/modules/presentacion/components/slidesCatalogo'

export function ReportesPage() {
  // La sección "Evolución de dotación" y sus datos se mudaron desde el Tablero
  // de KPIs. Arranca colapsada; se despliega al tocar el encabezado.
  const [abierto, setAbierto] = useState(false)

  // ── Sección "Presentación — slides" (colapsable, arranca cerrada) ───────────
  // Permite ver un slide puntual o todos juntos, reutilizando el viewer del
  // módulo de presentación. `seleccion`: número de slide activo, 'todas' para
  // apilar los 8, o null cuando todavía no se eligió ninguno.
  const [abiertoSlides, setAbiertoSlides] = useState(false)
  const [seleccion, setSeleccion] = useState<number | 'todas' | null>(null)

  // Números de todos los slides del catálogo (para el modo "Ver todas juntas").
  const todosLosNumeros = SLIDES_CATALOGO.map((s) => s.numero)

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

      {/* ── Presentación — slides (colapsable) — mismo patrón que arriba ───────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          type="button"
          onClick={() => setAbiertoSlides((v) => !v)}
          aria-expanded={abiertoSlides}
          className="w-full flex items-center justify-between gap-3 p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-lg"
        >
          <h2 className="font-primary text-base font-bold text-gray-900">Presentación — slides</h2>
          <svg
            className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${abiertoSlides ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
        {abiertoSlides && (
          <div className="px-6 pb-6 space-y-4">
            {/* ── Selector: un botón por slide + "Ver todas juntas" ───────── */}
            <div className="flex flex-wrap gap-2">
              {SLIDES_CATALOGO.map((s) => {
                const activo = seleccion === s.numero
                return (
                  <button
                    key={s.numero}
                    type="button"
                    onClick={() => setSeleccion(s.numero)}
                    aria-pressed={activo}
                    className={`font-primary text-sm font-semibold px-3 py-1.5 rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                      activo
                        ? 'bg-secondary text-white border-secondary'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {`${s.numero} · ${s.titulo}`}
                  </button>
                )
              })}
              {/* Botón "Ver todas juntas": apila los 8 slides. */}
              <button
                type="button"
                onClick={() => setSeleccion('todas')}
                aria-pressed={seleccion === 'todas'}
                className={`font-primary text-sm font-semibold px-3 py-1.5 rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                  seleccion === 'todas'
                    ? 'bg-secondary text-white border-secondary'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Ver todas juntas
              </button>
            </div>

            {/* ── Render del slide elegido (o de todos), escalado al ancho ──── */}
            {seleccion === null ? (
              <p className="text-xs text-gray-400">Elegí un slide para verlo.</p>
            ) : seleccion === 'todas' ? (
              <SlidesViewer numeros={todosLosNumeros} className="flex flex-col gap-6" />
            ) : (
              <SlidesViewer numeros={[seleccion]} className="flex flex-col" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
