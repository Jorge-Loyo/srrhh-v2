import { useState } from 'react'
import type { ConciliacionIncidencias } from '../hooks/useIncidencias'

const fmt = (n: number) => n.toLocaleString('es-AR')

// Panel colapsable de conciliación de la dotación: la suma de los grupos
// excluyentes de cargos debe dar el total (invariante del diseño).
export function PanelConciliacion({
  conciliacion,
  abiertoInicial,
}: {
  conciliacion: ConciliacionIncidencias
  abiertoInicial: boolean
}) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const g = conciliacion.grupos
  const desajuste = conciliacion.sumaGrupos !== conciliacion.totalCargos
  return (
    <div className="bg-white rounded-lg shadow-sm">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-lg"
      >
        {abierto ? '▾' : '▸'} Conciliación de la dotación
      </button>
      {abierto && (
        <div className="px-4 pb-4 space-y-1 text-sm text-gray-600">
          <p>
            Dotación: <strong>{fmt(conciliacion.dotacion)}</strong> = Ocupados {fmt(g.ocupado)} + En concurso{' '}
            {fmt(g.en_concurso)} + Baja sin concurso {fmt(g.baja_sin_concurso)} + Sin clasificar{' '}
            {fmt(g.sin_clasificar)}
            {g.alta_pendiente > 0 && <> + Alta pendiente {fmt(g.alta_pendiente)}</>}
          </p>
          <p>
            Cargos cerrados (no vigentes): {fmt(g.no_vigente)} — Total de cargos: {fmt(conciliacion.totalCargos)}
          </p>
          {desajuste && (
            <p role="alert" className="text-red-600 font-semibold">
              La suma de los grupos ({fmt(conciliacion.sumaGrupos)}) no coincide con el total de cargos (
              {fmt(conciliacion.totalCargos)}): avisar a sistemas.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
