import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAreasProgramaticas, useUnidadesFijas,
  TIPO_UNIDAD_FIJA_LABEL, NIVEL_ORGANICO_LABEL,
} from '../hooks/useAreasProgramaticas'
import { capitalizarEtiqueta } from '@/shared/lib/utils'

const TABS = [
  { key: 'ap', label: 'Áreas Programáticas' },
  { key: 'fija', label: 'Estructura fija' },
] as const
type TabKey = (typeof TABS)[number]['key']

// S23-7: listado — tabs Áreas Programáticas (13, del Anexo III) / Estructura
// fija (7, del Decreto 306-26, sin AP asignada). Sigue el boceto adjunto al
// sprint: KPIs arriba + tabla/grilla de tarjetas abajo.
export function AreasProgramaticasPage() {
  const [tab, setTab] = useState<TabKey>('ap')
  const { data: areas, isLoading: loadingAreas } = useAreasProgramaticas()
  const { data: unidades, isLoading: loadingUnidades } = useUnidadesFijas()

  const totalCesacs = (areas ?? []).reduce((acc, a) => acc + a.cesacs, 0)
  const totalCargosAp = (areas ?? []).reduce((acc, a) => acc + a.cargosVigentes, 0)

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 pt-4">
        <h1 className="font-primary text-xl font-bold text-gray-900 mb-3">Área Programática</h1>
        <div className="flex gap-1 -mb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key ? 'border-secondary text-secondary' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label} <span className="opacity-60">{t.key === 'ap' ? areas?.length ?? '' : unidades?.length ?? ''}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'ap' && (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Áreas Programáticas</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{areas?.length ?? '—'}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">CeSACs</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{totalCesacs}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cargos vigentes vinculados</p>
              <p className="text-2xl font-bold text-secondary mt-0.5">{totalCargosAp.toLocaleString('es-AR')}</p>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white rounded-lg shadow-sm border border-gray-200">
            {loadingAreas && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
            {!loadingAreas && (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Área Programática</th>
                    <th className="px-4 py-2.5 font-semibold">Hospital de referencia</th>
                    <th className="px-4 py-2.5 font-semibold text-right">CeSACs</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Cargos vigentes</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {areas?.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link to={`/organigrama/areas-programaticas/${a.id}`} className="font-semibold text-secondary hover:underline">
                          {capitalizarEtiqueta(a.nombre)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{a.hospitalNombre} <span className="text-gray-400">({a.hospitalSigla})</span></td>
                      <td className="px-4 py-3 text-right">{a.cesacs}</td>
                      <td className="px-4 py-3 text-right font-semibold">{a.cargosVigentes.toLocaleString('es-AR')}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/organigrama/areas-programaticas/${a.id}`} className="text-gray-300 hover:text-secondary">›</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'fija' && (
        <div className="flex-1 flex flex-col gap-4 overflow-auto min-h-0">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2.5 items-start shrink-0">
            <span className="text-amber-600 shrink-0">⚠️</span>
            <p className="text-sm text-amber-900">
              Unidades nombradas en el Decreto 306-26 (Anexo XI) que <b>no</b> están asignadas a ninguna Área
              Programática puntual — el decreto no define esa correspondencia. Se listan igual, tal como las nombra.
            </p>
          </div>

          {loadingUnidades && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
          <div className="grid grid-cols-3 gap-3">
            {unidades?.map((u) => (
              <Link
                key={u.id}
                to={`/organigrama/unidades-fijas/${u.id}`}
                className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-secondary hover:shadow-sm transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 text-sm">{capitalizarEtiqueta(u.nombre)}</span>
                  <span className="text-[10.5px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                    {NIVEL_ORGANICO_LABEL[u.nivelOrganico]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{TIPO_UNIDAD_FIJA_LABEL[u.tipo]}</p>
                <p className="text-xs text-gray-400">Sin AP asignada · {u.cargosVigentes} cargos vigentes</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
