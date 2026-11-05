import { useState } from 'react'
import type { ConciliacionIncidencias } from '../hooks/useIncidencias'

const fmt = (n: number) => n.toLocaleString('es-AR')

// Panel colapsable de conciliación del universo gestionable: la suma de los
// grupos excluyentes de cargos debe dar el total (invariante del diseño). Los
// números son del subconjunto de cargos que el sistema gestiona (sobre los que
// se generan bajas, concursos y nuevos cargos), NO de la dotación total.
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
        {abierto ? '▾' : '▸'} Conciliación del universo gestionable
      </button>
      {abierto && (
        <div className="px-4 pb-4 space-y-1 text-sm text-gray-600">
          <p className="text-xs text-gray-500">
            Los números corresponden al <strong>universo gestionable</strong>: los cargos sobre los que el equipo
            genera bajas, concursos y nuevos cargos. No son la dotación total de la organización.
          </p>
          <p>
            Dotación gestionable: <strong>{fmt(conciliacion.dotacion)}</strong> = Ocupados {fmt(g.ocupado)} + En
            concurso {fmt(g.en_concurso)} + Baja sin concurso {fmt(g.baja_sin_concurso)} + Sin clasificar{' '}
            {fmt(g.sin_clasificar)}
            {g.alta_pendiente > 0 && <> + Alta pendiente {fmt(g.alta_pendiente)}</>}
          </p>
          <p>
            Cargos cerrados (no vigentes): {fmt(g.no_vigente)} — Total de cargos gestionables:{' '}
            {fmt(conciliacion.totalCargos)}
          </p>
          {desajuste && (
            <p role="alert" className="text-red-600 font-semibold">
              La suma de los grupos ({fmt(conciliacion.sumaGrupos)}) no coincide con el total de cargos gestionables (
              {fmt(conciliacion.totalCargos)}): avisar a sistemas.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
