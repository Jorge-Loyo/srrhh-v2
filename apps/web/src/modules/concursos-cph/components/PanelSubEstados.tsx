// Panel lateral (columna derecha del wizard) con la línea de tiempo de
// sub-estados del concurso CPH. Verde = completado, amarillo = paso actual.
import { SUB_ESTADOS } from '../lib/wizard.constants'

interface PanelSubEstadosProps {
  /** Índice del sub-estado "en curso" (amarillo). Los menores quedan verdes. */
  currentIdx: number
  pendienteAutorizacion: boolean
}

export function PanelSubEstados({ currentIdx, pendienteAutorizacion }: PanelSubEstadosProps) {
  return (
    <div className="w-52 shrink-0 sticky top-[var(--header-offset,160px)]">
      <div className="bg-white rounded-lg shadow-sm p-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Sub-estado actual
        </p>
        {pendienteAutorizacion && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
            <span className="text-amber-500 text-sm">⏳</span>
            <div>
              <p className="text-[10px] font-bold text-amber-700 leading-tight">
                Autorización pendiente
              </p>
              <p className="text-[10px] text-amber-600 leading-tight">
                Esperando aprobación de SGRASV para continuar
              </p>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          {SUB_ESTADOS.map((s, idx) => {
            const isCurrent = idx === currentIdx
            const isPast = idx < currentIdx
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div className="flex flex-col items-center self-stretch">
                  <span
                    className={[
                      'w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5',
                      isCurrent && pendienteAutorizacion
                        ? 'bg-amber-400 ring-2 ring-amber-200 animate-pulse'
                        : isCurrent
                          ? 'bg-amber-400 ring-2 ring-amber-200'
                          : isPast
                            ? 'bg-green-400'
                            : 'bg-gray-200',
                    ].join(' ')}
                  />
                  {idx < SUB_ESTADOS.length - 1 && (
                    <span
                      className={`w-px flex-1 mt-0.5 ${isPast ? 'bg-green-300' : 'bg-gray-200'}`}
                    />
                  )}
                </div>
                <span
                  className={[
                    'text-xs pb-1.5 leading-tight',
                    isCurrent
                      ? 'font-bold text-amber-700'
                      : isPast
                        ? 'text-gray-500'
                        : 'text-gray-300',
                  ].join(' ')}
                >
                  {s.label}
                  {isCurrent && pendienteAutorizacion && (
                    <span className="ml-1 text-[10px] text-amber-500">⏳</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
