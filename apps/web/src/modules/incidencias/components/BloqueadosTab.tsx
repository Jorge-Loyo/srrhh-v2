import { useEffect, useState } from 'react'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { useBloqueados } from '../hooks/useIncidencias'
import { fechaCorta } from '../lib/tabsIncidencias'

// Pestaña "Bloqueados" (FASE 5): ocupaciones vivas cuyo puesto está bloqueado
// (fecha_bloqueo cargada), del universo gestionable. SOLO LECTURA (monitoreo).
export function BloqueadosTab() {
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [carrera, setCarrera] = useState('')
  const [page, setPage] = useState(1)
  const { data: escalafones } = useEscalafones()

  const params = {
    page,
    pageSize: 50,
    q: q.trim().length >= 2 ? q.trim() : undefined,
    carrera: carrera || undefined,
  }
  const { data, isLoading, isError, refetch } = useBloqueados(params)

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
        Puestos bloqueados según el último padrón cargado (ocupaciones vigentes con fecha de bloqueo). Solo lectura:
        no modifica datos.
      </p>
      <div
        role="note"
        className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
      >
        El bloqueo es una condición del puesto que se actualiza al cargar un padrón. La lista se completa con el
        próximo padrón procesado; hasta entonces puede mostrar muy pocas filas.
      </div>
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
      </div>
      {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      {isError && (
        <div className="text-sm text-danger flex items-center gap-2">
          No se pudo cargar "Bloqueados".
          <button className="btn-outline text-xs px-2 py-1" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {!isLoading && !isError && data && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {data.items.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              {q || carrera
                ? 'No hay bloqueados que coincidan con los filtros.'
                : 'No hay puestos bloqueados en el padrón vigente.'}
            </p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold rounded-tl-lg">Persona</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Hospital</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Carrera</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Puesto</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Especialidad</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Código de registro</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Fecha de bloqueo</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Motivo</th>
                  <th scope="col" className="px-4 py-3 font-semibold rounded-tr-lg">Comentario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((i) => (
                  <tr key={i.cargoId} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{i.persona?.nombre ?? '—'}</div>
                      {i.persona?.cuil && <div className="text-xs text-gray-400">{i.persona.cuil}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{i.hospitalSigla ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.carrera ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.puesto ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.especialidad ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{i.codigoRegistro ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fechaCorta(i.fechaBloqueo)}</td>
                    <td className="px-4 py-3 text-gray-600">{i.bloqMotivo ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{i.bloqueoComentario ?? '—'}</td>
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
