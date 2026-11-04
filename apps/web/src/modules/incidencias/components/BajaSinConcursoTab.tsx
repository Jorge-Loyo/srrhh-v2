import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { useBajaSinConcurso } from '../hooks/useIncidencias'
import { fechaCorta } from '../lib/tabsIncidencias'

type FiltroOrigen = '' | 'baja_sial' | 'padron'
type FiltroEstado = '' | 'vigente' | 'validacion_vacante'

function chipDias(dias: number | null): string {
  if (dias == null) return 'text-gray-400'
  if (dias > 90) return 'text-red-600 font-semibold'
  if (dias > 30) return 'text-amber-600 font-semibold'
  return 'text-gray-700'
}

export function BajaSinConcursoTab() {
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [carrera, setCarrera] = useState('')
  const [origen, setOrigen] = useState<FiltroOrigen>('')
  const [estadoCargo, setEstadoCargo] = useState<FiltroEstado>('')
  const [page, setPage] = useState(1)
  const { data: escalafones } = useEscalafones()

  const params = {
    page,
    pageSize: 50,
    q: q.trim().length >= 2 ? q.trim() : undefined,
    carrera: carrera || undefined,
    origen: origen || undefined,
    estadoCargo: estadoCargo || undefined,
  }
  const { data, isLoading, isError, refetch } = useBajaSinConcurso(params)

  // Debounce 300 ms del buscador; solo se envía con >= 2 caracteres.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  function reiniciarPagina<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Cargos vacantes sin concurso activo, detectados en la baja SIAL semanal o ausentes del último padrón.
        Monitoreo: no modifica datos.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block text-sm flex-1">
          <span className="text-gray-700 font-medium">Buscar</span>
          <input
            type="search"
            placeholder="Persona, CUIL, id_sial o código (mín. 2 caracteres)"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="block text-sm sm:w-64">
          <span className="text-gray-700 font-medium">Carrera</span>
          <SearchableSelect
            value={carrera}
            onChange={reiniciarPagina(setCarrera)}
            options={(escalafones ?? []).map((e) => escalafonLabel(e.nombre))}
            placeholder="Todas las carreras"
            className="mt-1"
          />
        </div>
        <label className="block text-sm sm:w-56">
          <span className="text-gray-700 font-medium">Estado del cargo</span>
          <select
            value={estadoCargo}
            onChange={(e) => reiniciarPagina(setEstadoCargo)(e.target.value as FiltroEstado)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Todos</option>
            <option value="vigente">Vigente</option>
            <option value="validacion_vacante">Validación de vacante</option>
          </select>
        </label>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            ['', `Todos (${(data?.porOrigen.baja_sial ?? 0) + (data?.porOrigen.padron ?? 0)})`],
            ['baja_sial', `Baja SIAL (${data?.porOrigen.baja_sial ?? 0})`],
            ['padron', `Solo padrón (${data?.porOrigen.padron ?? 0})`],
          ] as [FiltroOrigen, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => reiniciarPagina(setOrigen)(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              origen === key ? 'border-primary text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      {isError && (
        <div className="text-sm text-danger flex items-center gap-2">
          No se pudo cargar "Baja sin concurso".
          <button className="btn-outline text-xs px-2 py-1" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {!isLoading && !isError && data && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {data.items.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              {q || carrera || origen || estadoCargo
                ? 'No hay bajas sin concurso que coincidan con los filtros.'
                : 'No hay bajas sin concurso. Todos los cargos vacantes tienen concurso o están cubiertos.'}
            </p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold rounded-tl-lg">Código</th>
                  <th scope="col" className="px-4 py-3 font-semibold">ID SIAL</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Hospital</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Carrera</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Puesto</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Especialidad</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Persona</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cómo se detectó</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Días sin cubrir</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-3 rounded-tr-lg" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((i) => {
                  const fecha = i.deteccion.fechaBaja ?? i.deteccion.fechaDeteccion
                  return (
                    <tr key={i.cargoId} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{i.codigo ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{i.idSial ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{i.hospitalSigla ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{i.carrera ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{i.puesto ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{i.especialidad ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{i.persona?.nombre ?? '—'}</div>
                        {i.persona?.cuil && <div className="text-xs text-gray-400">{i.persona.cuil}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{i.deteccion.texto}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                            {i.deteccion.origen === 'baja_sial' ? 'Baja SIAL' : 'Solo padrón'}
                          </span>
                          {i.deteccion.enBajaSial && i.deteccion.ausentePadron && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                              También ausente del padrón
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fechaCorta(fecha)}</td>
                      <td className={`px-4 py-3 ${chipDias(i.diasSinCubrir)}`}>{i.diasSinCubrir ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {i.estadoCargo === 'vigente' ? 'Vigente' : 'Validación de vacante'}
                        {i.subEstado && <> · {i.subEstado}</>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/cargos/${i.cargoId}`} className="text-xs text-primary hover:underline">
                          Ver cargo
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {data.meta.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-500 border-t border-gray-100">
              <span>
                Página {data.meta.page} de {data.meta.pages} — total {data.meta.total}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-outline text-xs px-2 py-1"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <button
                  className="btn-outline text-xs px-2 py-1"
                  disabled={page >= data.meta.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
