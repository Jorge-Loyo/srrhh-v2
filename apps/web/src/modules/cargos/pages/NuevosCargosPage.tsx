import { Fragment } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SubEstadoCargo } from '@srrhh/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { capitalizar } from '@/shared/lib/utils'
import { useNuevosCargos, type NuevosCargosFilters } from '../hooks/useNuevosCargos'

const LIMIT = 50

// Etiqueta del sub-estado del cargo (solo se muestran los dos visibles de la
// vista: vacante | concurso).
const SUB_ESTADO_LABEL: Record<string, string> = {
  [SubEstadoCargo.VACANTE]: 'Vacante',
  [SubEstadoCargo.CONCURSO]: 'Concurso',
}

// Formatea una fecha ISO (o Date serializada) a dd/mm/aaaa; '—' si no hay.
function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR')
}

// PASO A (flujo concursos): "Nuevos cargos" — vista de SOLO LECTURA de los
// cargos creados por alta (idSial MANUAL-%) que están VIGENTE/VACANTE o
// VIGENTE/CONCURSO, ordenados por expediente de creación (el "bloque": los
// cargos de una misma alta comparten expediente). La fuente es GET
// /api/v1/cargos/nuevos (lee de la tabla `cargos`, no del endpoint de
// concursos). Acciones por fila: "Ver" (navega al detalle /cargos/:id) y
// "Caratular" DESHABILITADO (placeholder; la acción real es el Paso C).
export function NuevosCargosPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const hospitalId = searchParams.get('hospitalId') ?? ''
  const subEstado = (searchParams.get('subEstado') ?? '') as '' | 'vacante' | 'concurso'
  const page = Number(searchParams.get('page') ?? '1')

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function setPage(p: (prev: number) => number) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const newPage = p(Number(prev.get('page') ?? '1'))
        if (newPage === 1) next.delete('page')
        else next.set('page', String(newPage))
        return next
      },
      { replace: true },
    )
  }

  const searchDebounced = useDebounce(search, 300)

  const filters: NuevosCargosFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(subEstado && { subEstado }),
  }

  const { data, isLoading, isFetching, isError } = useNuevosCargos(filters)
  const { data: hospitales } = useHospitales()

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <h1 className="font-primary text-xl font-bold text-gray-900">Nuevos cargos</h1>
          <p className="text-sm text-gray-500">
            Cargos creados por alta que están por concursar o en concurso, agrupados por expediente de
            creación. Cuando se designa a alguien (pasan a ocupados) salen de esta vista.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por código, puesto, especialidad o expediente..."
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[260px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <select
            value={hospitalId}
            onChange={(e) => setParam('hospitalId', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todas las reparticiones</option>
            {hospitales?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.sigla}
              </option>
            ))}
          </select>
          <select
            value={subEstado}
            onChange={(e) => setParam('subEstado', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Vacantes y en concurso</option>
            <option value="vacante">Solo vacantes</option>
            <option value="concurso">Solo en concurso</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-y-auto min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando nuevos cargos...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar la vista de nuevos cargos.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">
                No hay cargos nuevos por concursar para los filtros aplicados.
              </p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Código Cargo</th>
                    <th className="px-4 py-3 font-semibold">Repartición</th>
                    <th className="px-4 py-3 font-semibold">Carrera</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Especialidad</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((c, i) => {
                    // Separador visual por expediente: encabeza cada "bloque"
                    // (los cargos de una misma alta comparten expediente). Como
                    // el listado ya viene ordenado por expediente desde el
                    // backend, basta comparar con la fila anterior de la página.
                    const prev = data.data[i - 1]
                    const nuevoBloque = i === 0 || prev?.expediente !== c.expediente
                    const subLabel = c.subEstado ? SUB_ESTADO_LABEL[c.subEstado] ?? '—' : '—'
                    return (
                      <Fragment key={c.id}>
                        {nuevoBloque && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Expediente: {c.expediente ?? 'Sin expediente'}
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{c.codigo ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{c.escalafon?.nombre ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{capitalizar(c.literalPuesto) || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {capitalizar(c.especialidadPuesto?.nombre ?? c.especialidadLegacy) || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={subLabel === 'Concurso' ? 'badge-info' : 'badge-warning'}>
                              {subLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmtFecha(c.fechaDesde ?? c.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                to={`/cargos/${c.id}`}
                                state={{ from: searchParams.toString() }}
                                className="btn-outline"
                              >
                                Ver
                              </Link>
                              {/* Placeholder: la acción "Caratular" es el Paso C
                                  del flujo (crear/caratular concurso). Va
                                  deshabilitada hasta implementarla. */}
                              <button
                                type="button"
                                disabled
                                title="Disponible en el próximo paso"
                                className="btn-outline opacity-40 cursor-not-allowed"
                              >
                                Caratular
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
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
