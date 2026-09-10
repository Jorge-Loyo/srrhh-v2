import { useMemo, useState } from 'react'
import { ScaleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { useHospitalesPou, usePouComparar } from '../hooks/usePou'

const METRICAS = [
  { key: 'dotacionTotal', label: 'Dotación Total' },
  { key: 'dotacionDiaria', label: 'Dotación Diaria' },
  { key: 'dotacionSem', label: 'Dotación Semanal' },
  { key: 'activos', label: 'Activos' },
  { key: 'tecnicos', label: 'Técnicos' },
  { key: 'vacantes', label: 'Vacantes' },
] as const

const MIN_HOSPITALES = 2
const MAX_HOSPITALES = 50

// Puerto simplificado de POUComparativaPage.jsx (app vieja) — sin período
// (v2 no guarda histórico de POU) y con un selector de hospitales por
// checkboxes en vez del MultiSelectDropdown viejo (no existía un componente
// equivalente en v2 y no vale la pena traerlo para un solo uso).
export function PouComparativaPage() {
  const { data: siglasConDatos = [] } = useHospitalesPou()
  const { data: hospitales } = useHospitales()
  const [siglas, setSiglas] = useState<string[]>([])
  const [buscarHospital, setBuscarHospital] = useState('')
  const [metrica, setMetrica] = useState<(typeof METRICAS)[number]['key']>('dotacionTotal')
  const [filtroPerfil, setFiltroPerfil] = useState('')
  const [filtroEspecialidad, setFiltroEspecialidad] = useState('')

  const opcionesHospital = useMemo(() => {
    const porSigla = new Map((hospitales ?? []).map((h) => [h.sigla, h]))
    return siglasConDatos
      .map((sigla) => ({ sigla, nombre: porSigla.get(sigla)?.nombre ?? sigla }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [siglasConDatos, hospitales])

  const q = buscarHospital.trim().toLowerCase()
  const opcionesFiltradas = q
    ? opcionesHospital.filter((h) => h.nombre.toLowerCase().includes(q) || h.sigla.toLowerCase().includes(q))
    : opcionesHospital

  const toggleSigla = (sigla: string) => {
    setSiglas((prev) => {
      if (prev.includes(sigla)) return prev.filter((s) => s !== sigla)
      if (prev.length >= MAX_HOSPITALES) return prev
      return [...prev, sigla]
    })
  }

  const puedeComparar = siglas.length >= MIN_HOSPITALES
  const { data: rows = [], isLoading, error } = usePouComparar(siglas)

  // Agrupa las filas (una por hospital) en combos de perfil/especialidad
  const combos = useMemo(() => {
    const map = new Map<string, { perfil: string; especialidad: string; porSigla: Record<string, (typeof rows)[number]> }>()
    rows.forEach((r) => {
      const key = `${r.perfil || ''}|||${r.especialidad || ''}`
      if (!map.has(key)) map.set(key, { perfil: r.perfil, especialidad: r.especialidad, porSigla: {} })
      map.get(key)!.porSigla[r.sigla] = r
    })
    return [...map.values()].sort((a, b) => {
      const cmp = (a.perfil || '').localeCompare(b.perfil || '')
      return cmp !== 0 ? cmp : (a.especialidad || '').localeCompare(b.especialidad || '')
    })
  }, [rows])

  const perfilesOpts = useMemo(() => [...new Set(combos.map((c) => c.perfil).filter(Boolean))].sort(), [combos])
  const especialidadesOpts = useMemo(() => {
    const source = filtroPerfil ? combos.filter((c) => c.perfil === filtroPerfil) : combos
    return [...new Set(source.map((c) => c.especialidad).filter(Boolean))].sort()
  }, [combos, filtroPerfil])

  const combosFiltrados = useMemo(
    () =>
      combos.filter((c) => {
        if (filtroPerfil && c.perfil !== filtroPerfil) return false
        if (filtroEspecialidad && c.especialidad !== filtroEspecialidad) return false
        return true
      }),
    [combos, filtroPerfil, filtroEspecialidad]
  )

  const totales = useMemo(() => {
    const t: Record<string, number> = {}
    siglas.forEach((s) => { t[s] = 0 })
    combosFiltrados.forEach((c) => {
      siglas.forEach((s) => { t[s] += Number(c.porSigla[s]?.[metrica]) || 0 })
    })
    return t
  }, [combosFiltrados, siglas, metrica])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <ScaleIcon className="w-5 h-5 text-primary-700" />
          <h1 className="text-lg font-bold text-gray-900">POU – Comparativa entre Hospitales</h1>
        </div>

        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-72">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Hospitales (mín. {MIN_HOSPITALES}) — {siglas.length} seleccionados
            </label>
            <input
              type="text"
              value={buscarHospital}
              onChange={(e) => setBuscarHospital(e.target.value)}
              placeholder="Buscar hospital..."
              className="form-input text-sm w-full py-1.5 mb-1.5"
            />
            <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto bg-white">
              {opcionesFiltradas.map((h) => (
                <label key={h.sigla} className="flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={siglas.includes(h.sigla)} onChange={() => toggleSigla(h.sigla)} className="shrink-0" />
                  <span className="font-mono text-xs font-semibold text-primary-700 shrink-0">{h.sigla}</span>
                  <span className="text-gray-700 truncate">{h.nombre}</span>
                </label>
              ))}
              {opcionesFiltradas.length === 0 && <p className="text-center py-3 text-xs text-gray-400">Sin resultados</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Métrica</label>
            <select value={metrica} onChange={(e) => setMetrica(e.target.value as typeof metrica)} className="form-input text-sm py-1.5 w-44">
              {METRICAS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          {siglas.length > 0 && (
            <button onClick={() => setSiglas([])} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 mt-5">
              <XMarkIcon className="w-3.5 h-3.5" />Limpiar selección
            </button>
          )}
        </div>

        {combos.length > 0 && (
          <div className="flex items-end gap-3 mt-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Perfil</label>
              <select value={filtroPerfil} onChange={(e) => { setFiltroPerfil(e.target.value); setFiltroEspecialidad('') }} className="form-input text-sm w-48 py-1.5">
                <option value="">Todos</option>
                {perfilesOpts.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Especialidad</label>
              <select value={filtroEspecialidad} onChange={(e) => setFiltroEspecialidad(e.target.value)} className="form-input text-sm w-56 py-1.5">
                <option value="">Todas</option>
                {especialidadesOpts.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden px-4 py-3 min-h-0">
        {!puedeComparar && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Seleccioná al menos {MIN_HOSPITALES} hospitales para ver la comparativa
          </div>
        )}
        {puedeComparar && error && (
          <div className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700 flex-shrink-0">Error al cargar la comparativa</div>
        )}
        {puedeComparar && isLoading ? (
          <div className="flex-1 flex justify-center items-center text-gray-400 text-sm">Cargando...</div>
        ) : puedeComparar && (
          <div className="overflow-auto rounded-lg border border-gray-200 flex-1 min-h-0">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Perfil</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Especialidad</th>
                  {siglas.map((s) => (
                    <th key={s} className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {combosFiltrados.map((c) => (
                  <tr key={`${c.perfil}|${c.especialidad}`} className="odd:bg-white even:bg-gray-50/50">
                    <td className="px-3 py-2">{c.perfil ?? '—'}</td>
                    <td className="px-3 py-2">{c.especialidad ?? '—'}</td>
                    {siglas.map((s) => (
                      <td key={s} className="px-3 py-2 text-right tabular-nums font-medium">
                        {c.porSigla[s]?.[metrica] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {combosFiltrados.length === 0 && (
                  <tr><td colSpan={2 + siglas.length} className="px-3 py-10 text-center text-gray-400">Sin datos para los filtros seleccionados</td></tr>
                )}
                {combosFiltrados.length > 0 && (
                  <tr className="bg-primary-50 font-semibold border-t-2 border-primary-200">
                    <td className="px-3 py-2 text-xs text-primary-700" colSpan={2}>
                      TOTAL · {METRICAS.find((m) => m.key === metrica)?.label}
                    </td>
                    {siglas.map((s) => (
                      <td key={s} className="px-3 py-2 text-right tabular-nums text-primary-700">{totales[s]}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
