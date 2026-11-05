import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { useTodoIncidencias, type TipoIncidenciaSlug } from '../hooks/useIncidencias'
import { fechaCorta } from '../lib/tabsIncidencias'

const CHIP_TIPO: Record<TipoIncidenciaSlug, string> = {
  'sial-sin-cargo': 'bg-orange-100 text-orange-700 border-orange-200',
  'baja-sin-concurso': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'cayo-del-padron': 'bg-red-100 text-red-700 border-red-200',
  'cambio-situacion-revista': 'bg-amber-100 text-amber-700 border-amber-200',
  'cambios-del-puesto': 'bg-sky-100 text-sky-700 border-sky-200',
  otras: 'bg-gray-100 text-gray-700 border-gray-200',
}

// Unión de los tipos de incidencia. Las acciones que modifican datos viven solo
// en la pestaña "SIAL sin cargo": acá "Gestionar" navega hacia allá.
export function TodoTab({
  puedeGestionar,
  onGestionar,
}: {
  puedeGestionar: boolean
  onGestionar: (idSial: string) => void
}) {
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [carrera, setCarrera] = useState('')
  // La pestaña "Todo" muestra la unión sin sub-filtro por tipo (la navegación
  // por tipo ya está en las pestañas principales de arriba).
  const tipo: '' | TipoIncidenciaSlug = ''
  const [page, setPage] = useState(1)
  const { data: escalafones } = useEscalafones()

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  const { data, isLoading, isError, refetch } = useTodoIncidencias({
    page,
    pageSize: 50,
    q: q.trim().length >= 2 ? q.trim() : undefined,
    carrera: carrera || undefined,
    tipo: tipo || undefined,
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Todas las incidencias de la dotación. Una misma persona puede figurar dos veces, una por tipo
        (por ejemplo, un traslado).
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
            onChange={(v) => {
              setCarrera(v)
              setPage(1)
            }}
            options={(escalafones ?? []).map((e) => escalafonLabel(e.nombre))}
            placeholder="Todas las carreras"
            className="mt-1"
          />
        </div>
      </div>
      {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      {isError && (
        <div className="text-sm text-danger flex items-center gap-2">
          No se pudo cargar "Todo".
          <button className="btn-outline text-xs px-2 py-1" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {!isLoading && !isError && data && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {data.items.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              {q || carrera || tipo ? 'No hay incidencias que coincidan con los filtros.' : 'No hay incidencias.'}
            </p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold rounded-tl-lg">Tipo</th>
                  <th scope="col" className="px-4 py-3 font-semibold">ID SIAL</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Código</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Hospital</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Carrera</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Puesto</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Especialidad</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Persona</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Detalle</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
                  <th scope="col" className="px-4 py-3 rounded-tr-lg" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((i) => (
                  <tr key={i.clave} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CHIP_TIPO[i.tipo]}`}>
                        {i.tipoLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{i.idSial ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{i.codigo ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.hospitalSigla ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.carrera ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.puesto ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.especialidad ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{i.personaNombre ?? '—'}</div>
                      {i.personaCuil && <div className="text-xs text-gray-400">{i.personaCuil}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{i.detalle}</td>
                    <td className="px-4 py-3 text-gray-600">{fechaCorta(i.fecha)}</td>
                    <td className="px-4 py-3 text-right">
                      {i.tipo === 'baja-sin-concurso' && i.cargoId && (
                        <Link to={`/cargos/${i.cargoId}`} className="text-xs text-primary hover:underline">
                          Ver cargo
                        </Link>
                      )}
                      {i.tipo === 'sial-sin-cargo' && puedeGestionar && i.idSial && (
                        <button className="btn-primary text-xs px-2 py-1" onClick={() => onGestionar(i.idSial as string)}>
                          Gestionar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.meta.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-500 border-t border-gray-100">
              <span>
                Página {data.meta.page} de {data.meta.pages} — total {data.meta.total}
              </span>
              <div className="flex gap-2">
                <button className="btn-outline text-xs px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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
