import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { useKpiDotacion, useKpiConcursos, useKpiAlertas, useKpiDotacionHistorica, useKpiBajas } from '../hooks/useKpis'
import { EvolucionDotacionChart } from '../components/EvolucionDotacionChart'

function KpiCard({ label, value, loading }: { label: string; value: string | number; loading: boolean }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border-2 border-primary p-5">
      <p className="text-sm font-secondary text-gray-500 mb-1">{label}</p>
      {loading ? (
        <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
      ) : (
        <p className="font-primary text-3xl font-bold text-gray-900">{value}</p>
      )}
    </div>
  )
}

function SeccionSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-3">
      <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}

function BarraProporcion({ vigentes, vacantes }: { vigentes: number; vacantes: number }) {
  const pctVacantes = vigentes > 0 ? Math.round((vacantes / vigentes) * 100) : 0
  if (vacantes === 0) return null
  return (
    <div className="w-full h-2 bg-gray-100 rounded overflow-hidden">
      <div className="h-full bg-danger" style={{ width: `${pctVacantes}%` }} />
    </div>
  )
}

export function KpisPage() {
  const [hospitalId, setHospitalId] = useState('')

  const { data: hospitales } = useHospitales()
  const { data: dotacion, isLoading: loadingDotacion, isError: errorDotacion } = useKpiDotacion(hospitalId || undefined)
  const { data: concursos, isLoading: loadingConcursos, isError: errorConcursos } = useKpiConcursos(hospitalId || undefined)
  const { data: alertas, isLoading: loadingAlertas } = useKpiAlertas(hospitalId || undefined)
  const { data: historica, isLoading: loadingHistorica } = useKpiDotacionHistorica(hospitalId || undefined, 'mes')
  const { data: bajas, isLoading: loadingBajas } = useKpiBajas(hospitalId || undefined)

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-primary text-xl font-bold text-gray-900">Tablero de KPIs</h1>
        <select
          value={hospitalId}
          onChange={(e) => setHospitalId(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
        >
          <option value="">Todos los hospitales</option>
          {hospitales?.map((h) => (
            <option key={h.id} value={h.id}>{h.sigla}</option>
          ))}
        </select>
      </div>

      {(errorDotacion || errorConcursos) && (
        <div className="bg-white rounded-lg shadow-sm border border-danger p-6 text-sm text-danger">
          No se pudieron cargar los KPIs. Reintentá en unos segundos.
        </div>
      )}

      {/* ── Cards dotación + concursos ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Cargos vigentes" value={dotacion?.totalVigentes ?? 0} loading={loadingDotacion} />
        <KpiCard label="Vacantes" value={dotacion?.vacantes ?? 0} loading={loadingDotacion} />
        <KpiCard label="Concursos CPH" value={concursos?.totalCph ?? 0} loading={loadingConcursos} />
        <KpiCard label="Concursos CEETPS" value={concursos?.totalCeetps ?? 0} loading={loadingConcursos} />
      </div>

      {/* ── Cards bajas ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard label="Bajas a validar" value={bajas?.bajasAValidar ?? 0} loading={loadingBajas} />
        <KpiCard label="Bajas confirmadas" value={bajas?.bajasConfirmadas ?? 0} loading={loadingBajas} />
      </div>

      {/* ── Detalle bajas a validar por escalafón ─────────────────────── */}
      {loadingBajas ? (
        <SeccionSkeleton />
      ) : (bajas?.porEscalafon.length ?? 0) > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="font-primary text-base font-bold text-gray-900 mb-1">Bajas a validar por escalafón</h2>
          <p className="text-xs text-gray-400 mb-4">
            Cargos detectados como vacantes por el padrón, pendientes de confirmación administrativa
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {bajas?.porEscalafon.map((e) => (
              <div key={e.escalafon} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                <span className="text-gray-700">{e.escalafon}</span>
                <span className="font-semibold text-gray-900">{e.total.toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Evolución de dotación histórica ──────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="font-primary text-base font-bold text-gray-900 mb-1">Evolución de la dotación</h2>
        <p className="text-xs text-gray-400 mb-4">Personas únicas por fecha de padrón aprobada</p>
        {loadingHistorica ? (
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
        ) : (
          <EvolucionDotacionChart data={historica} />
        )}
      </div>

      {/* ── Dotación por carrera / por efector ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loadingDotacion ? (
          <>
            <SeccionSkeleton />
            <SeccionSkeleton />
          </>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col max-h-[540px]">
              <h2 className="font-primary text-base font-bold text-gray-900 mb-4">Dotación por carrera</h2>
              <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
                {dotacion?.porCarrera.map((c) => (
                  <div key={c.escalafonId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{c.nombre}</span>
                      <span className="text-gray-500">
                        {c.vigentes.toLocaleString('es-AR')} vigentes
                        {c.vacantes > 0 && <span className="text-danger font-medium"> · {c.vacantes.toLocaleString('es-AR')} vacantes</span>}
                      </span>
                    </div>
                    <BarraProporcion vigentes={c.vigentes} vacantes={c.vacantes} />
                  </div>
                ))}
                {dotacion?.porCarrera.length === 0 && (
                  <p className="text-sm text-gray-400">Sin datos para este filtro.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col max-h-[540px]">
              <h2 className="font-primary text-base font-bold text-gray-900 mb-4">Dotación por efector</h2>
              <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
                {dotacion?.porEfector.map((h) => (
                  <div key={h.hospitalId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{h.sigla}</span>
                      <span className="text-gray-500">
                        {h.vigentes.toLocaleString('es-AR')} vigentes
                        {h.vacantes > 0 && <span className="text-danger font-medium"> · {h.vacantes.toLocaleString('es-AR')} vacantes</span>}
                      </span>
                    </div>
                    <BarraProporcion vigentes={h.vigentes} vacantes={h.vacantes} />
                  </div>
                ))}
                {dotacion?.porEfector.length === 0 && (
                  <p className="text-sm text-gray-400">Sin datos para este filtro.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Alertas activas ───────────────────────────────────────────── */}
      {loadingAlertas ? (
        <SeccionSkeleton />
      ) : (
        (alertas?.concursosVencidos.length ?? 0) > 0 || (alertas?.bajasSinConcurso.length ?? 0) > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border-2 border-danger p-6">
            <h2 className="font-primary text-base font-bold text-gray-900 mb-4">Alertas activas</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Concursos CPH vencidos ({alertas?.concursosVencidos.length ?? 0})
                </p>
                <p className="text-xs text-gray-400 mb-2">Venció el plazo de inscripción sin haberse programado examen.</p>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {alertas?.concursosVencidos.map((c) => (
                    <Link
                      key={c.id}
                      to={`/concursos/cph/${c.id}`}
                      className="flex justify-between text-sm py-1.5 border-b border-gray-100 hover:bg-gray-50 rounded px-1"
                    >
                      <span className="text-gray-700">{c.cargoCodigo} · {c.hospitalSigla}</span>
                      <span className="text-danger font-semibold">{c.diasVencido}d vencido</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Bajas sin concurso ({alertas?.bajasSinConcurso.length ?? 0})
                </p>
                <p className="text-xs text-gray-400 mb-2">Vacante registrada sin ningún proceso de cobertura iniciado.</p>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {alertas?.bajasSinConcurso.map((b) => (
                    <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100 px-1">
                      <span className="text-gray-700">{b.cargoCodigo} · {b.hospitalSigla}</span>
                      <span className="text-danger font-semibold">{b.diasSinConcurso}d sin concurso</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ── Concursos: por sub-estado / tiempo promedio por etapa ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loadingConcursos ? (
          <>
            <SeccionSkeleton />
            <SeccionSkeleton />
          </>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="font-primary text-base font-bold text-gray-900 mb-4">Concursos CPH por sub-estado</h2>
              <div className="space-y-2">
                {concursos?.porSubEstadoCph.map((s) => (
                  <div key={s.subEstado} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-700">{s.subEstado}</span>
                    <span className="font-semibold text-gray-900">{s.total}</span>
                  </div>
                ))}
                {concursos?.porSubEstadoCph.length === 0 && (
                  <p className="text-sm text-gray-400">No hay concursos CPH cargados todavía.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="font-primary text-base font-bold text-gray-900 mb-1">Tiempo promedio por etapa (CPH)</h2>
              <p className="text-xs text-gray-400 mb-4">Días entre hitos consecutivos del concurso</p>
              <div className="space-y-2">
                {concursos?.tiempoPromedioPorEtapa.some(e => e.diasPromedio !== null) ? (
                  concursos.tiempoPromedioPorEtapa
                    .filter(e => e.muestras > 0)
                    .map((e) => (
                      <div key={e.etapa} className="flex justify-between items-baseline text-sm border-b border-gray-100 pb-2">
                        <span className="text-gray-700">{e.etapa}</span>
                        <span className="text-right">
                          <span className="font-semibold text-gray-900">
                            {e.diasPromedio !== null ? `${e.diasPromedio.toFixed(1)} días` : '—'}
                          </span>
                          <span className="text-gray-400 ml-1">({e.muestras})</span>
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-gray-400">Sin datos de etapas aún.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
