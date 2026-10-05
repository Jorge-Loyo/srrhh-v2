import { Link, useParams } from 'react-router-dom'
import { useUnidadFija, TIPO_UNIDAD_FIJA_LABEL, NIVEL_ORGANICO_LABEL } from '../hooks/useAreasProgramaticas'
import { PersonalTable } from '../components/PersonalTable'

// S23-7/S23-11: detalle de una unidad fija (CEMAR/COI/Red de Odontología) —
// mismo patrón que CesacDetailPage, incluido el callout del Jefe.
export function UnidadFijaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: unidad, isLoading, isError } = useUnidadFija(id)

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando...</p>
  if (isError || !unidad) return <p className="text-sm text-danger p-6">No se pudo cargar la unidad fija.</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Link to="/areas-programaticas" className="hover:underline hover:text-secondary">Área Programática</Link>
        <span className="text-gray-300">›</span>
        <span className="font-semibold text-gray-700">{unidad.nombre}</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-navy px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-white text-xl font-bold leading-tight">{unidad.nombre}</h1>
              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-white/15 text-white">
                {NIVEL_ORGANICO_LABEL[unidad.nivelOrganico]}
              </span>
            </div>
            <p className="text-white/70 text-sm mt-1">{TIPO_UNIDAD_FIJA_LABEL[unidad.tipo]}</p>
            <p className="text-white/50 text-xs mt-0.5">Sin AP asignada — el decreto no define esa correspondencia</p>
          </div>
          <Link
            to={`/dotacion?unidadFijaId=${unidad.id}`}
            className="shrink-0 inline-flex items-center gap-1.5 bg-primary text-black text-sm font-semibold px-4 py-2 rounded hover:opacity-90 transition-opacity"
          >
            Ver cargos en Dotación ›
          </Link>
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-secondary/5 flex items-center gap-2.5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Jefe</p>
          {unidad.jefe ? (
            <p className="text-sm">
              <span className="font-bold text-gray-900">{unidad.jefe.nombre}</span>
              {unidad.jefe.cargo && <span className="text-gray-500"> — {unidad.jefe.cargo}</span>}
            </p>
          ) : (
            <p className="text-sm text-gray-400">Sin jefe resuelto</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Personal en {unidad.nombre}</p>
          <p className="text-xs text-gray-400">{unidad.cargosVigentes} cargos vigentes</p>
        </div>
        <PersonalTable personal={unidad.personal} />
      </div>
    </div>
  )
}
