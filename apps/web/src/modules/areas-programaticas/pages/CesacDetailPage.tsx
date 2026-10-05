import { Link, useParams } from 'react-router-dom'
import { useCesac, NIVEL_CESAC_LABEL } from '../hooks/useAreasProgramaticas'
import { PersonalTable } from '../components/PersonalTable'

// S23-7: detalle de un CeSAC puntual — dirección/barrio/nivel, AP/hospital
// de referencia, personal vigente. El callout de "Jefe" (S23-11) queda para
// cuando S23-10 resuelva el jefe en runtime — todavía no está hecho.
export function CesacDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: cesac, isLoading, isError } = useCesac(id)

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando...</p>
  if (isError || !cesac) return <p className="text-sm text-danger p-6">No se pudo cargar el CeSAC.</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-xs text-gray-500 flex-wrap">
        <Link to="/areas-programaticas" className="hover:underline hover:text-secondary">Área Programática</Link>
        <span className="text-gray-300">›</span>
        <Link to={`/areas-programaticas/${cesac.areaProgramatica.id}`} className="hover:underline hover:text-secondary">
          {cesac.areaProgramatica.nombre}
        </Link>
        <span className="text-gray-300">›</span>
        <span className="font-semibold text-gray-700">CeSAC Nº {cesac.numero}</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-navy px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-white text-xl font-bold leading-tight">CeSAC Nº {cesac.numero}</h1>
              <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded ${
                cesac.nivel === 'unidad_con_seccion' ? 'bg-amber-100 text-amber-800' : 'bg-white/15 text-white'
              }`}>
                {NIVEL_CESAC_LABEL[cesac.nivel]}
              </span>
            </div>
            <p className="text-white/70 text-sm mt-1">
              {cesac.direccion ?? 'Sin dirección'}{cesac.barrio ? ` · ${cesac.barrio}` : ''}
            </p>
            <p className="text-white/50 text-xs mt-0.5">
              AP de referencia: {cesac.areaProgramatica.nombre} ({cesac.areaProgramatica.hospital.sigla})
            </p>
          </div>
          <Link
            to={`/dotacion?cesacId=${cesac.id}`}
            className="shrink-0 inline-flex items-center gap-1.5 bg-primary text-black text-sm font-semibold px-4 py-2 rounded hover:opacity-90 transition-opacity"
          >
            Ver cargos en Dotación ›
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Personal en CeSAC Nº {cesac.numero}</p>
          <p className="text-xs text-gray-400">{cesac.cargosVigentes} cargos vigentes</p>
        </div>
        <PersonalTable personal={cesac.personal} />
      </div>
    </div>
  )
}
