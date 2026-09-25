import { Fragment, useMemo, useState } from 'react'
import type { UrgenciaVencimiento, VencimientoCargo } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '../../../shared/lib/can'
import { CadenaRetencionPanel } from '../components/CadenaRetencionPanel'
import { RenovarPeriodoModal } from '../components/RenovarPeriodoModal'
import { useVencimientos } from '../hooks/useVencimientos'

const PAGE_SIZE = 30

type FiltroUrgencia = 'todos' | '90' | '30' | 'vencidos'

const FILTROS: { key: FiltroUrgencia; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: '90', label: '≤ 90 días' },
  { key: '30', label: '≤ 30 días' },
  { key: 'vencidos', label: 'Vencidos' },
]

const BADGE: Record<UrgenciaVencimiento, { clase: string; estado: string }> = {
  ok: { clase: 'bg-gray-100 text-gray-600 border-gray-200', estado: 'Vigente' },
  aviso: { clase: 'bg-yellow-100 text-yellow-800 border-yellow-200', estado: 'Por vencer (≤90d)' },
  recordatorio: { clase: 'bg-orange-100 text-orange-800 border-orange-200', estado: 'Por vencer (≤30d)' },
  critico: { clase: 'bg-orange-100 text-orange-800 border-orange-200', estado: 'Por vencer (≤30d)' },
  vencido: { clase: 'bg-red-100 text-red-700 border-red-200', estado: 'Vencido' },
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Cargos con período de conducción que vence (TTR y bases de conducción),
// ordenados por días restantes. Los cargos que no vencen no aparecen.
export function VencimientosPage() {
  const { user } = useAuth()
  const puedeRenovar = can(user, 'retenciones', 'crear')
  const { data, isLoading, isError } = useVencimientos()
  const [renovando, setRenovando] = useState<VencimientoCargo | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [hospital, setHospital] = useState('')
  const [urgencia, setUrgencia] = useState<FiltroUrgencia>('todos')
  const [page, setPage] = useState(1)
  const [conCadena, setConCadena] = useState<string | null>(null)

  const todos = data ?? []
  const hospitales = useMemo(
    () => [...new Set(todos.map((v) => v.hospitalSigla))].sort(),
    [todos],
  )

  const q = busqueda.toLowerCase().trim()
  const filtrados = todos.filter((v) => {
    if (hospital && v.hospitalSigla !== hospital) return false
    if (urgencia === '90' && v.diasRestantes > 90) return false
    if (urgencia === '30' && v.diasRestantes > 30) return false
    if (urgencia === 'vencidos' && v.urgencia !== 'vencido') return false
    if (!q) return true
    return (
      v.codigo?.toLowerCase().includes(q) ||
      v.literalPuesto?.toLowerCase().includes(q) ||
      v.ocupanteNombre?.toLowerCase().includes(q) ||
      v.ocupanteCuil?.includes(q)
    )
  })

  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE)
  const paginaActual = totalPages === 0 ? 1 : Math.min(page, totalPages)
  const pagina = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)
  const vencidos = todos.filter((v) => v.urgencia === 'vencido').length
  const porVencer = todos.filter((v) => v.urgencia !== 'vencido' && v.diasRestantes <= 90).length

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">Vencimientos de conducción</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Cargos con período de conducción vigente, ordenados por días restantes. Los cargos de planta y
              Director/Subdirector/Vicedirector no vencen.
            </p>
          </div>
          {data && (
            <div className="flex gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-center">
                <div className="text-lg font-bold text-red-700">{vencidos}</div>
                <div className="text-xs text-red-600">Vencidos</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-yellow-50 border border-yellow-200 text-center">
                <div className="text-lg font-bold text-yellow-700">{porVencer}</div>
                <div className="text-xs text-yellow-600">≤ 90 días</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setPage(1)
            }}
            placeholder="Buscar por cargo, ocupante, CUIL..."
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 w-72"
          />
          <select
            value={hospital}
            onChange={(e) => {
              setHospital(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white"
          >
            <option value="">Todos los hospitales</option>
            {hospitales.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setUrgencia(f.key)
                  setPage(1)
                }}
                className={`h-9 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                  urgencia === f.key
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudieron cargar los vencimientos.</p>}
        {!isLoading && !isError && filtrados.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400">
            {busqueda || hospital || urgencia !== 'todos'
              ? 'Sin resultados para los filtros.'
              : 'No hay cargos con vencimiento.'}
          </p>
        )}

        {!isLoading && !isError && pagina.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cargo</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Ocupante</th>
                  <th className="px-4 py-3 font-semibold">Período hasta</th>
                  <th className="px-4 py-3 font-semibold">Días</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagina.map((v) => {
                  const b = BADGE[v.urgencia]
                  const abierta = conCadena === v.id
                  return (
                    <Fragment key={v.id}>
                      <tr className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-bold text-gray-800">{v.codigo ?? '—'}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[240px]" title={v.literalPuesto ?? ''}>
                            {v.literalPuesto ?? '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{v.hospitalSigla}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{v.ocupanteNombre ?? '—'}</p>
                          {v.ocupanteCuil && (
                            <p className="font-mono text-xs text-gray-500">{v.ocupanteCuil}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {fmtFecha(v.periodoHasta)}
                          {v.periodoRenovado && (
                            <span className="ml-1.5 text-[10px] text-purple-600">renovado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${b.clase}`}>
                            {v.diasRestantes <= 0 ? `${Math.abs(v.diasRestantes)} d vencido` : `${v.diasRestantes} d`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{b.estado}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            className="text-xs font-semibold text-navy hover:underline"
                            onClick={() => setConCadena(abierta ? null : v.id)}
                          >
                            {abierta ? '▲ Ocultar cadena' : '▼ Ver cadena'}
                          </button>
                          {puedeRenovar && (
                            <button
                              className="ml-3 text-xs font-semibold text-primary hover:underline"
                              onClick={() => setRenovando(v)}
                            >
                              Renovar
                            </button>
                          )}
                        </td>
                      </tr>
                      {abierta && (
                        <tr>
                          <td colSpan={7} className="px-4 py-3 bg-gray-50">
                            <CadenaRetencionPanel cargoId={v.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {paginaActual} de {totalPages} — {filtrados.length} en total
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={paginaActual <= 1} onClick={() => setPage(paginaActual - 1)}>
                    Anterior
                  </button>
                  <button className="btn-outline" disabled={paginaActual >= totalPages} onClick={() => setPage(paginaActual + 1)}>
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {renovando && <RenovarPeriodoModal cargo={renovando} onClose={() => setRenovando(null)} />}
    </div>
  )
}
