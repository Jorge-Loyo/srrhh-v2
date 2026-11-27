import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ComboBuscable } from '@/shared/components/selectores/ComboBuscable'
import { useCodigosRegistro } from '@/shared/hooks/useCatalogos'
import { etiquetaCarreraCR, ordenarCarrerasCR } from '@/shared/lib/carreraEtiqueta'
import { capitalizarEtiqueta } from '@/shared/lib/utils'
import { useBajaSinConcurso } from '../hooks/useIncidencias'
import { fechaCorta } from '../lib/tabsIncidencias'
import { useMemo } from 'react'

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
  const [estadoCargo, setEstadoCargo] = useState<FiltroEstado>('')
  const [page, setPage] = useState(1)
  const { data: codigos = [] } = useCodigosRegistro()

  const carreraOpts = useMemo(
    () => ordenarCarrerasCR(codigos).map((c) => ({ value: c.codigo.trim(), label: etiquetaCarreraCR(c) })),
    [codigos],
  )

  const params = {
    page,
    pageSize: 50,
    q: q.trim().length >= 2 ? q.trim() : undefined,
    carrera: carrera || undefined,
    estadoCargo: estadoCargo || undefined,
  }
  const { data, isLoading, isError, refetch } = useBajaSinConcurso(params)

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  function reiniciarPagina<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Cargos que figuran en la baja SIAL, siguen vigentes en el sistema y no tienen concurso activo ni baja formal confirmada.
        Son los cargos que hay que gestionar: iniciar concurso, declarar no vigente o declarar vacante.
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
        <div className="block text-sm sm:w-72">
          <ComboBuscable
            modo="unico"
            label="Carrera"
            options={carreraOpts}
            selected={carrera ? [carrera] : []}
            onChange={(v) => reiniciarPagina(setCarrera)(v[0] ?? '')}
            placeholder="Todas las carreras"
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

      {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      {isError && (
        <div className="text-sm text-danger flex items-center gap-2">
          No se pudo cargar "Baja sin concurso".
          <button className="btn-outline text-xs px-2 py-1" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}
      {!isLoading && !isError && data && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {data.items.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              {q || carrera || estadoCargo
                ? 'No hay bajas sin concurso que coincidan con los filtros.'
                : 'No hay bajas sin concurso pendientes de gestión.'}
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
                  <th scope="col" className="px-4 py-3 font-semibold">Motivo baja</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Fecha baja</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Días</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                  <th scope="col" className="px-4 py-3 rounded-tr-lg" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((i) => (
                  <tr key={i.cargoId} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{i.codigo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{i.idSial}</td>
                    <td className="px-4 py-3 text-gray-600">{i.hospitalSigla ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{capitalizarEtiqueta(i.carrera)}</td>
                    <td className="px-4 py-3 text-gray-600">{capitalizarEtiqueta(i.puesto)}</td>
                    <td className="px-4 py-3 text-gray-600">{capitalizarEtiqueta(i.especialidad)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{capitalizarEtiqueta(i.persona?.nombre)}</div>
                      {i.persona?.cuil && <div className="text-xs text-gray-400">{i.persona.cuil}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{capitalizarEtiqueta(i.bajaSial.motBaja) ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fechaCorta(i.bajaSial.cargoHasta)}</td>
                    <td className={`px-4 py-3 ${chipDias(i.diasDesdeBaja)}`}>{i.diasDesdeBaja ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{i.estadoCargo === 'vigente' ? 'Vigente' : 'En validación'}</div>
                      {i.subEstado && <div className="text-xs text-gray-400">{i.subEstado}</div>}
                      {i.bajaFormal && (
                        <div className="text-xs text-amber-700 mt-0.5">Baja en borrador</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/cargos/${i.cargoId}`} className="text-xs text-primary hover:underline">
                        Ver cargo
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.meta.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-500 border-t border-gray-100">
              <span>Página {data.meta.page} de {data.meta.pages} — total {data.meta.total}</span>
              <div className="flex gap-2">
                <button className="btn-outline text-xs px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                <button className="btn-outline text-xs px-2 py-1" disabled={page >= data.meta.pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
