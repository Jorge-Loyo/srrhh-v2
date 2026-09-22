import { useState } from 'react'
import { useCadenaRetencion } from '../hooks/useCadenaRetencion'
import { CadenaRetencionTree } from './CadenaRetencionTree'

interface Props {
  cargoId: string
}

// Panel autocontenido — mismo patrón que CadenaMandoPanel (cadena-mando/):
// colapsado por defecto, fetch lazy al abrir.
export function CadenaRetencionPanel({ cargoId }: Props) {
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useCadenaRetencion(cargoId, open)

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-navy px-6 py-3 flex items-center justify-between hover:bg-navy/90 transition-colors"
      >
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Cadena de retención</h2>
        <span className="text-white/70 text-xs">{open ? '▲ Cerrar' : '▼ Ver'}</span>
      </button>

      {open && (
        <div className="px-6 py-4">
          {isLoading && <p className="text-sm text-gray-400">Cargando...</p>}
          {isError && <p className="text-sm text-danger">No se pudo cargar la cadena de retención.</p>}
          {data && <CadenaRetencionTree nodos={data.nodos} />}
        </div>
      )}
    </div>
  )
}
