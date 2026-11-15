import { useState } from 'react'
import { useDistribucionCargos } from '../hooks/useReportes'

function fmt(n: number) {
  return n.toLocaleString('es-AR')
}

function Cell({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex flex-col items-end leading-tight">
      <span>{fmt(value)}</span>
      <span className="text-xs text-gray-400">{pct}%</span>
    </div>
  )
}

export function DistribucionCargosSection() {
  const [abierto, setAbierto] = useState(false)
  const { data, isLoading, isError, refetch } = useDistribucionCargos(abierto)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center justify-between gap-3 p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-lg"
      >
        <h2 className="font-primary text-base font-bold text-gray-900">
          Distribución de cargos por escalafón
        </h2>
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
            Universo total de cargos vigentes y en validación, agrupados por escalafón y sub-estado.
            Fuente: tabla <code>cargos</code> de la BD.
          </p>

          {isLoading && <div className="h-48 bg-gray-100 rounded animate-pulse" />}

          {isError && (
            <div role="alert" className="text-sm text-red-700 flex items-center gap-3">
              No se pudo cargar la distribución.
              <button type="button" onClick={() => refetch()} className="underline font-semibold">
                Reintentar
              </button>
            </div>
          )}

          {data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-primary border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-700">Escalafón</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Ocupado</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Vacante</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Concurso</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">En validación</th>
                    <th className="text-right py-2 pl-3 font-semibold text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((fila) => (
                    <tr key={fila.escalafon} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-800">{fila.escalafon}</td>
                      <td className="py-2 px-3 text-right text-gray-700 tabular-nums">
                        <Cell value={fila.ocupado} total={fila.total} />
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 tabular-nums">
                        <Cell value={fila.vacante} total={fila.total} />
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 tabular-nums">
                        <Cell value={fila.concurso} total={fila.total} />
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 tabular-nums">
                        <Cell value={fila.validacion_vacante} total={fila.total} />
                      </td>
                      <td className="py-2 pl-3 text-right font-semibold text-gray-900 tabular-nums">
                        {fmt(fila.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="py-2 pr-4 font-bold text-gray-900">TOTAL</td>
                    <td className="py-2 px-3 text-right font-bold text-gray-900 tabular-nums">
                      {fmt(data.totales.ocupado)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-gray-900 tabular-nums">
                      {fmt(data.totales.vacante)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-gray-900 tabular-nums">
                      {fmt(data.totales.concurso)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-gray-900 tabular-nums">
                      {fmt(data.totales.validacion_vacante)}
                    </td>
                    <td className="py-2 pl-3 text-right font-bold text-gray-900 tabular-nums">
                      {fmt(data.totales.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
