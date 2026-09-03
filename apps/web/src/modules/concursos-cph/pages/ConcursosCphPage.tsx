import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EstadoConcursoCph } from '@srrhh/types'
import type { ConcursoCphFilters } from '@srrhh/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { useConcursosCph } from '../hooks/useConcursosCph'
import { AlertasSinMovimiento } from '../components/AlertasSinMovimiento'
import {
  ESTADO_LABEL,
  ESTADO_BADGE,
  SUB_ESTADO_OPTIONS,
  SUB_ESTADO_3_OPTIONS,
  diasSinMovimiento,
  diasBadgeClass,
} from '../lib/labels'

const LIMIT = 50

export function ConcursosCphPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [estado, setEstado] = useState<'' | EstadoConcursoCph>('')
  const [subEstado, setSubEstado] = useState('')
  const [subEstado3, setSubEstado3] = useState('')
  const [suspendido, setSuspendido] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)
  const searchDebounced = useDebounce(search, 300)

  const filters: ConcursoCphFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(estado && { estado }),
    ...(subEstado && { subEstado }),
    ...(subEstado3 && { subEstado3 }),
    ...(suspendido && { suspendido: suspendido === 'true' }),
  }

  const { data, isLoading, isFetching, isError } = useConcursosCph(filters)
  const { data: hospitales } = useHospitales()

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  return (
    <div className="space-y-6">
      <AlertasSinMovimiento />

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Concursos CPH</h1>
          <button className="btn-primary" onClick={() => navigate('/concursos/cph/nuevo/wizard')}>
            + Nuevo Concurso CPH
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por expediente, especialidad, observaciones..."
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <select
            value={hospitalId}
            onChange={(e) => resetPage(setHospitalId)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los hospitales</option>
            {hospitales?.map((h) => (
              <option key={h.id} value={h.id}>
                {hospitalLabel(h)}
              </option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => resetPage(setEstado)(e.target.value as '' | EstadoConcursoCph)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los estados</option>
            {Object.values(EstadoConcursoCph).map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e]}
              </option>
            ))}
          </select>
          <select
            value={subEstado}
            onChange={(e) => resetPage(setSubEstado)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los sub-estados</option>
            {SUB_ESTADO_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={subEstado3}
            onChange={(e) => resetPage(setSubEstado3)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todas las etapas</option>
            {SUB_ESTADO_3_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={suspendido}
            onChange={(e) => resetPage(setSuspendido)(e.target.value as '' | 'true' | 'false')}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Suspendidos y activos</option>
            <option value="false">Solo no suspendidos</option>
            <option value="true">Solo suspendidos</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando concursos...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de concursos CPH.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">
                Sin resultados para los filtros aplicados.
              </p>
            )}

            {data.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''}`}>
                  <thead className="bg-navy text-white text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Hospital</th>
                      <th className="px-4 py-3 font-semibold">Cargo</th>
                      <th className="px-4 py-3 font-semibold">Especialidad</th>
                      <th className="px-4 py-3 font-semibold">Persona</th>
                      <th className="px-4 py-3 font-semibold">Expediente</th>
                      <th className="px-4 py-3 font-semibold">Disposición</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold">Sub-estado</th>
                      <th className="px-4 py-3 font-semibold">Últ. movimiento</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.data.map((c) => {
                      const dias = diasSinMovimiento(c.updatedAt)
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {c.concurso?.cargo?.codigo ?? c.concurso?.cargo?.literalPuesto ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {c.especialidadSolicitada ?? c.concurso?.cargo?.especialidad ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {c.concurso?.persona?.apellidoNombre ?? 'Vacante'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">
                            {c.eeConcurso ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {c.disposicion ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={ESTADO_BADGE[c.estado]}>{ESTADO_LABEL[c.estado]}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.subEstado ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={diasBadgeClass(dias)}>{dias === 0 ? 'Hoy' : `${dias} días`}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link to={`/concursos/cph/${c.id}/wizard`} className="btn-outline">
                              Ver
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </button>
                  <button
                    className="btn-outline"
                    disabled={page >= data.meta.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
