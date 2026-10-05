import { Link, useParams } from 'react-router-dom'
import { useAreaProgramatica, NIVEL_CESAC_LABEL } from '../hooks/useAreasProgramaticas'

// S23-7: detalle de AP — hospital de referencia + tabla de CeSACs, con link
// directo a Dotación ya filtrada por esta AP (S23-8).
export function AreaProgramaticaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: ap, isLoading, isError } = useAreaProgramatica(id)

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando...</p>
  if (isError || !ap) return <p className="text-sm text-danger p-6">No se pudo cargar el Área Programática.</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Link to="/areas-programaticas" className="hover:underline hover:text-secondary">Área Programática</Link>
        <span className="text-gray-300">›</span>
        <span className="font-semibold text-gray-700">{ap.nombre}</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-navy px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-white text-xl font-bold leading-tight">{ap.nombre}</h1>
            <p className="text-white/70 text-sm mt-1">
              Hospital de referencia: <span className="font-semibold text-white">{ap.hospital.nombre}</span> ({ap.hospital.sigla})
            </p>
          </div>
          <Link
            to={`/dotacion?areaProgramaticaId=${ap.id}`}
            className="shrink-0 inline-flex items-center gap-1.5 bg-primary text-black text-sm font-semibold px-4 py-2 rounded hover:opacity-90 transition-opacity"
          >
            Ver cargos en Dotación ›
          </Link>
        </div>
        <div className="px-6 py-3 flex gap-6 border-t border-gray-100 bg-gray-50">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">CeSACs</p>
            <p className="text-lg font-bold text-gray-900">{ap.cesacs.length}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cargos vigentes</p>
            <p className="text-lg font-bold text-secondary">{ap.cargosVigentes.toLocaleString('es-AR')}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">CeSACs de esta Área Programática</p>
          <p className="text-xs text-gray-400">{ap.cesacs.length} resultados</p>
        </div>
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide">CeSAC</th>
              <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide">Barrio</th>
              <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide">Nivel</th>
              <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide">Jefe</th>
              <th className="px-4 py-2 font-semibold text-xs uppercase tracking-wide text-right">Cargos vigentes</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ap.cesacs.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link to={`/cesacs/${c.id}`} className="font-semibold text-secondary hover:underline">Nº {c.numero}</Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.barrio ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded ${
                    c.nivel === 'unidad_con_seccion' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {NIVEL_CESAC_LABEL[c.nivel]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{c.jefe?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-right font-semibold">{c.cargosVigentes}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/cesacs/${c.id}`} className="text-gray-300 hover:text-secondary">›</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
