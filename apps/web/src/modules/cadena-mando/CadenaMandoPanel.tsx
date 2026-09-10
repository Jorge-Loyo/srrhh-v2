import { useState } from 'react'
import { useCadenaMando } from './useCadenaMando'

interface Props {
  personaId?: string
  codigoRepa?: string
}

const TIPO_COLOR: Record<string, string> = {
  Ministerio:    'bg-purple-100 text-purple-700',
  'SSEC/DIREJE': 'bg-blue-100 text-blue-700',
  DG:            'bg-blue-100 text-blue-700',
  DHOS:          'bg-indigo-100 text-indigo-700',
  SDHOS:         'bg-indigo-100 text-indigo-700',
  GO:            'bg-cyan-100 text-cyan-700',
  DEPT:          'bg-teal-100 text-teal-700',
  DIV:           'bg-green-100 text-green-700',
  SECCION:       'bg-gray-100 text-gray-600',
}

function tipoBadge(tipo: string) {
  const cls = TIPO_COLOR[tipo] ?? 'bg-gray-100 text-gray-500'
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{tipo}</span>
}

export function CadenaMandoPanel({ personaId, codigoRepa }: Props) {
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useCadenaMando(
    { personaId, codigoRepa },
    open
  )

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-navy px-6 py-3 flex items-center justify-between hover:bg-navy/90 transition-colors"
      >
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Cadena de mando</h2>
        <span className="text-white/70 text-xs">{open ? '▲ Cerrar' : '▼ Ver'}</span>
      </button>

      {open && (
        <div className="px-6 py-4">
          {isLoading && <p className="text-sm text-gray-400">Cargando...</p>}
          {isError && <p className="text-sm text-danger">No se pudo cargar la cadena de mando.</p>}
          {data && data.length === 0 && (
            <p className="text-sm text-gray-400">Sin datos de organigrama para este nodo.</p>
          )}
          {data && data.length > 0 && (
            <ol className="relative border-l-2 border-gray-200 space-y-0">
              {data.map((nodo, i) => (
                <li key={nodo.codigoReparticion} className="ml-4 pb-4 last:pb-0">
                  {/* Dot en la línea */}
                  <span className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${i === 0 ? 'bg-secondary' : 'bg-gray-300'}`} />

                  <div className="flex items-start gap-2 flex-wrap">
                    {tipoBadge(nodo.tipo)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${i === 0 ? 'text-secondary' : 'text-gray-800'}`}>
                        {nodo.descRep ?? nodo.codigoReparticion}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{nodo.codigoReparticion}</p>
                      {nodo.conductor ? (
                        <p className="text-xs text-gray-600 mt-0.5">
                          <span className="font-medium">{nodo.conductor}</span>
                          {nodo.cargoLiteral && (
                            <span className="text-gray-400"> · {nodo.cargoLiteral}</span>
                          )}
                          {nodo.codigoCargo && (
                            <span className="text-gray-400 font-mono"> · {nodo.codigoCargo}</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-500 mt-0.5 italic">Vacante</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
