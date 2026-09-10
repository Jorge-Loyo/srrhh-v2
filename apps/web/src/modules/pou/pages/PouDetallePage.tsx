import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { TableCellsIcon, ArrowLeftIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { usePouPorSigla } from '../hooks/usePou'

const COLS = [
  { key: 'perfil', label: 'Perfil', num: false },
  { key: 'especialidad', label: 'Especialidad', num: false },
  { key: 'dotacionDiaria', label: 'Dot. Diaria', num: true },
  { key: 'dotacionSem', label: 'Dot. Semanal', num: true },
  { key: 'dotacionTotal', label: 'Dot. Total', num: true },
  { key: 'activos', label: 'Activos', num: true },
  { key: 'tecnicos', label: 'Técnicos', num: true },
  { key: 'vacantes', label: 'Vacantes', num: true },
] as const

// Puerto simplificado de POUPage.jsx (app vieja) — sin selector de período,
// porque v2 no guarda histórico de POU (ver comentario del modelo Prisma).
export function PouDetallePage() {
  const { sigla: siglaParam } = useParams()
  const navigate = useNavigate()
  const sigla = siglaParam?.toUpperCase() ?? ''
  const { data: rows = [], isLoading, error } = usePouPorSigla(sigla || null)

  const [filtroPerfil, setFiltroPerfil] = useState('')
  const [filtroEspecialidad, setFiltroEspecialidad] = useState('')

  const perfilesOpts = useMemo(() => [...new Set(rows.map((r) => r.perfil).filter(Boolean))].sort(), [rows])
  const especialidadesOpts = useMemo(() => {
    const source = filtroPerfil ? rows.filter((r) => r.perfil === filtroPerfil) : rows
    return [...new Set(source.map((r) => r.especialidad).filter(Boolean))].sort()
  }, [rows, filtroPerfil])

  const rowsFiltradas = useMemo(
    () =>
      rows.filter((r) => {
        if (filtroPerfil && r.perfil !== filtroPerfil) return false
        if (filtroEspecialidad && r.especialidad !== filtroEspecialidad) return false
        return true
      }),
    [rows, filtroPerfil, filtroEspecialidad]
  )

  const totals = COLS.filter((c) => c.num).reduce<Record<string, number>>((acc, c) => {
    acc[c.key] = rowsFiltradas.reduce((s, r) => s + (Number(r[c.key as keyof typeof r]) || 0), 0)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => navigate('/pou')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-700 transition-colors mr-1 shrink-0">
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <TableCellsIcon className="w-5 h-5 text-primary-700 shrink-0" />
            <h1 className="text-lg font-bold text-gray-900 truncate">POU – {sigla}</h1>
          </div>
          {rows.length > 0 && (
            <span className="text-sm text-gray-400">
              {rowsFiltradas.length !== rows.length ? `${rowsFiltradas.length} de ${rows.length} registros` : `${rows.length} registros`}
            </span>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Perfil</label>
              <select
                value={filtroPerfil}
                onChange={(e) => { setFiltroPerfil(e.target.value); setFiltroEspecialidad('') }}
                className="form-input text-sm w-48 py-1.5"
              >
                <option value="">Todos</option>
                {perfilesOpts.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Especialidad</label>
              <select
                value={filtroEspecialidad}
                onChange={(e) => setFiltroEspecialidad(e.target.value)}
                className="form-input text-sm w-56 py-1.5"
              >
                <option value="">Todas</option>
                {especialidadesOpts.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            {(filtroPerfil || filtroEspecialidad) && (
              <button
                onClick={() => { setFiltroPerfil(''); setFiltroEspecialidad('') }}
                className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 mb-0.5"
              >
                <XMarkIcon className="w-3.5 h-3.5" />Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden px-4 py-3 min-h-0">
        {error && (
          <div className="mb-3 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700 flex-shrink-0">
            No se pudo cargar POU para {sigla}
          </div>
        )}
        {isLoading ? (
          <div className="flex-1 flex justify-center items-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="overflow-auto rounded-lg border border-gray-200 flex-1 min-h-0">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={`px-3 py-2.5 text-xs font-semibold text-gray-600 whitespace-nowrap ${c.num ? 'text-right' : 'text-left'}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map((row) => (
                  <tr key={row.id} className="odd:bg-white even:bg-gray-50/50">
                    {COLS.map((c) => (
                      <td key={c.key} className={`px-3 py-2 ${c.num ? 'text-right tabular-nums font-medium' : ''}`}>
                        {row[c.key as keyof typeof row] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {rowsFiltradas.length === 0 && (
                  <tr><td colSpan={COLS.length} className="px-3 py-10 text-center text-gray-400">Sin datos para los filtros seleccionados</td></tr>
                )}
                {rowsFiltradas.length > 0 && (
                  <tr className="bg-primary-50 font-semibold border-t-2 border-primary-200">
                    <td className="px-3 py-2 text-xs text-primary-700">TOTAL</td>
                    <td className="px-3 py-2" />
                    {COLS.filter((c) => c.num).map((c) => (
                      <td key={c.key} className="px-3 py-2 text-right tabular-nums text-primary-700">{totals[c.key]}</td>
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
