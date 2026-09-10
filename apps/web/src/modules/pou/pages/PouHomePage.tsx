import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Squares2X2Icon, ArrowRightIcon, ScaleIcon } from '@heroicons/react/24/outline'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { useHospitalesPou } from '../hooks/usePou'

// Selector de hospital para POU — mismo patrón de búsqueda que OrganigramaHomePage,
// pero la lista de siglas sale de la tabla `pou` (solo los hospitales que
// efectivamente tienen datos cargados), no del catálogo completo de Hospital.
export function PouHomePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { data: siglasConDatos } = useHospitalesPou()
  const { data: hospitales } = useHospitales()

  const items = useMemo(() => {
    const porSigla = new Map((hospitales ?? []).map((h) => [h.sigla, h]))
    return (siglasConDatos ?? [])
      .map((sigla) => ({ sigla, nombre: porSigla.get(sigla)?.nombre ?? sigla }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [siglasConDatos, hospitales])

  const q = search.trim().toLowerCase()
  const filtrados = q ? items.filter((h) => h.nombre.toLowerCase().includes(q) || h.sigla.toLowerCase().includes(q)) : items

  const go = (sigla: string) => navigate(`/pou/${sigla}`)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Squares2X2Icon className="w-5 h-5 text-primary-700" />
            <h1 className="text-lg font-bold text-gray-900">POU</h1>
          </div>
          <button onClick={() => navigate('/pou/comparativa')} className="btn-secondary flex items-center gap-1.5 text-sm">
            <ScaleIcon className="w-4 h-4" />
            Comparar hospitales
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-3">Seleccioná un hospital para ver su dotación POU</p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar hospital..."
          className="form-input text-sm w-full sm:w-72 py-1.5"
          autoFocus
        />
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtrados.map((h) => (
            <button
              key={h.sigla}
              onClick={() => go(h.sigla)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-primary-50 hover:border-primary-200 transition-colors text-left"
            >
              <span className="font-mono text-xs font-bold text-primary-700 w-16 flex-shrink-0">{h.sigla}</span>
              <span className="text-sm font-medium text-gray-800 flex-1">{h.nombre}</span>
              <ArrowRightIcon className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
        {filtrados.length === 0 && (
          <p className="text-center py-10 text-gray-400">
            {items.length === 0 ? 'Todavía no hay datos de POU cargados' : 'Sin resultados'}
          </p>
        )}
      </div>
    </div>
  )
}
