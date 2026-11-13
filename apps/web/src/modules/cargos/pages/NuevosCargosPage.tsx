import { Fragment, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { capitalizar } from '@/shared/lib/utils'
import { EtiquetasChips } from '@/shared/components/EtiquetaChip'
import { useNuevosCargos, type NuevosCargosFilters } from '../hooks/useNuevosCargos'
import {
  ETIQUETA_TIPO,
  rutaCaratular,
  textoSinConcurso,
  type TipoConcursoNuevo,
} from '../lib/nuevosCargos'

// Formatea una fecha ISO a dd/mm/aaaa; '—' si no hay.
function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR')
}

// PASO 4 (flujo concursos): "Nuevos cargos" — concursos de cargo nuevo que
// ningún usuario inició (se crean solos al aprobar el alta en /autorizaciones).
// Agrupados por expediente del alta. "Caratular" abre el concurso en su Etapa 1
// (Apertura / Autorización); no crea nada. Quien ve la pestaña (permiso
// cargos/tab:nuevos-cargos, configurable por rol) ve el botón. Al guardar la
// Etapa 1 con expediente + IF el concurso sale de esta lista y pasa a la
// bandeja Gestión de Concursos (/cargos/concurso).
export function NuevosCargosPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const hospitalId = searchParams.get('hospitalId') ?? ''
  const tipo = (searchParams.get('tipo') ?? '') as '' | TipoConcursoNuevo
  // Expedientes colapsados (por defecto todos expandidos).
  const [colapsados, setColapsados] = useState<Set<string>>(new Set())

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  function toggleGrupo(clave: string) {
    setColapsados((prev) => {
      const next = new Set(prev)
      if (next.has(clave)) next.delete(clave)
      else next.add(clave)
      return next
    })
  }

  const searchDebounced = useDebounce(search, 300)
  const filters: NuevosCargosFilters = {
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(tipo && { tipo }),
  }
  const { data, isLoading, isFetching, isError } = useNuevosCargos(filters)
  const { data: hospitales } = useHospitales()
  const hayFiltros = Boolean(searchDebounced || hospitalId || tipo)

  const claves = data?.data.map((g) => g.expediente ?? '') ?? []
  const todoColapsado = claves.length > 0 && claves.every((c) => colapsados.has(c))
  function toggleTodo() {
    setColapsados(todoColapsado ? new Set() : new Set(claves))
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <h1 className="font-primary text-xl font-bold text-gray-900">Nuevos cargos</h1>
          <p className="text-sm text-gray-500">
            Concursos de cargos nuevos que todavía nadie inició, agrupados por expediente del alta. Con
            Caratular se abre el concurso para completar la Etapa 1 (Apertura / Autorización) y enviarlo a
            autorizar.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            aria-label="Buscar nuevos cargos"
            placeholder="Buscar por expediente, código, puesto, especialidad o etiqueta..."
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[260px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <select
            aria-label="Filtrar por repartición"
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
            aria-label="Filtrar por tipo de concurso"
            value={tipo}
            onChange={(e) => setParam('tipo', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">CPH y CEETPS</option>
            <option value="cph">Solo CPH</option>
            <option value="ceetps">Solo CEETPS</option>
          </select>
          {data && data.data.length > 0 && (
            <button
              type="button"
              onClick={toggleTodo}
              className="h-10 px-3 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              {todoColapsado ? '▸ Descolapsar todo' : '▾ Colapsar todo'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-y-auto min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando nuevos cargos...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar la vista de nuevos cargos.</p>}
        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-500">
                  {hayFiltros
                    ? 'No hay concursos de cargos nuevos pendientes de caratular para los filtros aplicados.'
                    : 'No hay concursos de cargos nuevos pendientes de caratular.'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Los concursos se crean al aprobar el alta de cargo en Autorizaciones.
                </p>
              </div>
            )}
            {data.data.length > 0 && (
              <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Cargo</th>
                    <th className="px-4 py-3 font-semibold">Repartición</th>
                    <th className="px-4 py-3 font-semibold">Carrera</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Especialidad</th>
                    <th className="px-4 py-3 font-semibold">Etiquetas</th>
                    <th className="px-4 py-3 font-semibold">Fecha del alta</th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((g) => {
                    const clave = g.expediente ?? ''
                    const abierto = !colapsados.has(clave)
                    return (
                      <Fragment key={clave || 'sin-expediente'}>
                        <tr className="bg-gray-50">
                          <td colSpan={9} className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => toggleGrupo(clave)}
                              aria-expanded={abierto}
                              className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                            >
                              <span aria-hidden="true">{abierto ? '▾' : '▸'}</span>
                              Expediente: {g.expediente ?? 'Sin expediente'}
                              <span className="font-normal normal-case text-gray-500">
                                — {g.cantidad} {g.cantidad === 1 ? 'concurso' : 'concursos'} · alta {fmtFecha(g.fechaAlta)}
                              </span>
                            </button>
                          </td>
                        </tr>
                        {abierto &&
                          g.items.map((it) => (
                            <tr key={it.concursoId} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <span className={it.tipo === 'cph' ? 'badge-info' : 'badge-warning'}>
                                  {ETIQUETA_TIPO[it.tipo]}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-800">
                                {it.cargo.codigo ?? it.cargo.idSial ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{it.hospital?.sigla ?? '—'}</td>
                              <td className="px-4 py-3 text-gray-600">{it.carrera ?? '—'}</td>
                              <td className="px-4 py-3 text-gray-600">{capitalizar(it.puesto) || '—'}</td>
                              <td className="px-4 py-3 text-gray-600">{capitalizar(it.especialidad) || '—'}</td>
                              <td className="px-4 py-3">
                                <EtiquetasChips etiquetas={it.etiquetas} />
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{fmtFecha(it.fechaAlta)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <Link to={`/cargos/${it.cargo.id}`} className="btn-outline">
                                    Ver cargo
                                  </Link>
                                  <Link to={rutaCaratular(it)} className="btn-primary">
                                    Caratular
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}

            {data.sinConcurso.length > 0 && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">
                    Cargos nuevos sin concurso ({data.sinConcurso.length})
                  </h2>
                  <p className="text-xs text-gray-500">
                    Estos cargos se dieron de alta pero no tienen concurso, así que no se pueden caratular desde
                    acá.
                  </p>
                </div>
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="bg-gray-100 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Cargo</th>
                      <th className="px-4 py-2 font-semibold">Expediente</th>
                      <th className="px-4 py-2 font-semibold">Repartición</th>
                      <th className="px-4 py-2 font-semibold">Puesto</th>
                      <th className="px-4 py-2 font-semibold">Aviso</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.sinConcurso.map((c) => (
                      <tr key={c.cargoId}>
                        <td className="px-4 py-2 font-medium text-gray-800">{c.codigo ?? c.idSial ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{c.expediente ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{capitalizar(c.puesto) || '—'}</td>
                        <td className="px-4 py-2">
                          <span className="badge-warning">{textoSinConcurso(c.motivo)}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link to={`/cargos/${c.cargoId}`} className="btn-outline">
                            Ver cargo
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
