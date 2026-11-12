import { useState } from 'react'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { useCodigosRegistro, useHospitales } from '@/shared/hooks/useCatalogos'
import { useCargosIndicadores } from '../hooks/useReportes'
import { IndicadoresCargosTabla, PasaronNoVigenteBloque } from './IndicadoresCargosTabla'

function mesEnCurso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Sección colapsable "Indicadores de cargos": tres tablas (estado, vigente,
// ocupado por situación de revista), mes actual vs mes anterior, más un bloque aparte
// con los cargos que pasaron a no vigente en el período. El total es "a gestionar"
// (en validación + vigente): los no vigentes no suman. Solo cuenta cargos
// gestionables (el subconjunto sobre el que se generan bajas, concursos y nuevos
// cargos), NO la dotación total. Solo lectura.
export function IndicadoresCargosSection() {
  const [abierto, setAbierto] = useState(false)
  const [mes, setMes] = useState('')
  const [carrera, setCarrera] = useState('') // id de código de registro
  const [hospital, setHospital] = useState('') // id de hospital

  const { data: codigos = [] } = useCodigosRegistro()
  const { data: hospitales = [] } = useHospitales()

  const { data, isLoading, isError, refetch } = useCargosIndicadores(
    { mes: mes || undefined, hospitalId: hospital || undefined, codigoRegistroId: carrera || undefined },
    abierto,
  )

  const etiquetaCarrera = (id: string) => {
    const c = codigos.find((x) => x.id === id)
    return c ? `${c.codigo} — ${c.literal}` : ''
  }
  const etiquetaHospital = (id: string) => {
    const h = hospitales.find((x) => x.id === id)
    return h ? `${h.sigla} — ${h.nombre}` : ''
  }

  const ambosReconstruidos = data?.actual.modo === 'reconstruido'

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center justify-between gap-3 p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-lg"
      >
        <h2 className="font-primary text-base font-bold text-gray-900">Indicadores de cargos</h2>
        <svg
          className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {abierto && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-xs text-gray-400">
            Cantidad de cargos gestionables a gestionar (en validación + vigentes) por carrera, comparada con el mes
            anterior. Son los cargos sobre los que se generan bajas, concursos y nuevos cargos, no la dotación total.
            Los cargos no vigentes no se cuentan. Vista informativa (solo lectura).
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-gray-600 gap-1">
              Mes
              <input
                type="month"
                value={mes}
                min="2020-01"
                max={mesEnCurso()}
                onChange={(e) => setMes(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm font-primary"
              />
            </label>
            <div className="flex flex-col text-xs text-gray-600 gap-1 w-72">
              Carrera
              <SearchableSelect
                value={carrera}
                onChange={setCarrera}
                options={codigos.map((c) => `${c.codigo} — ${c.literal}`)}
                placeholder="Todas las carreras"
                displayToValue={(label) => codigos.find((c) => `${c.codigo} — ${c.literal}` === label)?.id ?? ''}
                valueToDisplay={etiquetaCarrera}
              />
            </div>
            <div className="flex flex-col text-xs text-gray-600 gap-1 w-72">
              Hospital
              <SearchableSelect
                value={hospital}
                onChange={setHospital}
                options={hospitales.map((h) => `${h.sigla} — ${h.nombre}`)}
                placeholder="Todos los hospitales"
                displayToValue={(label) => hospitales.find((h) => `${h.sigla} — ${h.nombre}` === label)?.id ?? ''}
                valueToDisplay={etiquetaHospital}
              />
            </div>
            {(mes || carrera || hospital) && (
              <button
                type="button"
                onClick={() => {
                  setMes('')
                  setCarrera('')
                  setHospital('')
                }}
                className="text-xs font-semibold text-secondary underline pb-2"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {isLoading && <div className="h-48 bg-gray-100 rounded animate-pulse" />}

          {isError && (
            <div role="alert" className="text-sm text-red-700 flex items-center gap-3">
              No se pudieron cargar los indicadores.
              <button type="button" onClick={() => refetch()} className="underline font-semibold">
                Reintentar
              </button>
            </div>
          )}

          {data && (
            <>
              <p className="text-xs text-gray-500" role="note">
                {ambosReconstruidos
                  ? 'Ambos meses reconstruidos a partir de fechas; pueden diferir de la foto real.'
                  : 'Mes anterior reconstruido a partir de fechas; puede diferir de la foto real.'}{' '}
                Los valores con ~ incluyen cargos inferidos. El color indica el signo del cambio, no si es bueno o malo.
              </p>
              {[data.actual, data.anterior].map(
                (p) =>
                  !p.disponible && (
                    <p key={p.mes} className="text-xs text-amber-700" role="note">
                      {p.mes}: sin datos reconstruibles ({p.motivoNoDisponible}).
                    </p>
                  ),
              )}
              {!data.conciliacion.ok && (
                <p role="alert" className="text-xs font-semibold text-red-700">
                  La suma de grupos no coincide con el total de cargos gestionables (a gestionar + no vigentes).
                  Avisar a Sistemas.
                </p>
              )}
              {data.tablas.map((t) => (
                <IndicadoresCargosTabla
                  key={t.id}
                  meta={t}
                  filas={data.filas}
                  total={data.total}
                  actual={data.actual}
                  anterior={data.anterior}
                  referenciaPersonas={data.referenciaPersonas}
                />
              ))}
              <PasaronNoVigenteBloque
                filas={data.filas}
                total={data.total}
                actual={data.actual}
                anterior={data.anterior}
                noVigenteSinFecha={data.noVigenteSinFecha}
              />
              {data.filas.length === 0 && <p className="text-sm text-gray-500">Sin cargos para los filtros elegidos.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
