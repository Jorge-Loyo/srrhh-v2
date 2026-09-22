import { useState } from 'react'
import { useRetenidos } from '../hooks/useCadenaRetencion'

const PAGE_SIZE = 30

// Lista de cargos ya retenidos (situacionRevista = 'Retencion de Cargo').
// Solo lectura — el registro de una retención se hace desde la pestaña Validación.
export function RetencionesListaPage() {
  const { data, isLoading, isError } = useRetenidos()
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)

  const todos = data ?? []
  const q = busqueda.toLowerCase().trim()
  // Filas (por persona) expandidas para ver todos sus cargos retenidos.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const toggleExpandir = (personaId: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev)
      next.has(personaId) ? next.delete(personaId) : next.add(personaId)
      return next
    })

  const filtrados = todos.filter((r) => {
    if (!q) return true
    return (
      r.persona.apellidoNombre.toLowerCase().includes(q) ||
      r.persona.cuil.includes(q) ||
      r.retenidos.some(
        (c) =>
          c.codigo?.toLowerCase().includes(q) ||
          c.literalPuesto?.toLowerCase().includes(q) ||
          c.hospitalSigla.toLowerCase().includes(q) ||
          c.escalafon.toLowerCase().includes(q),
      )
    )
  })

  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE)
  const paginaActual = totalPages === 0 ? 1 : Math.min(page, totalPages)
  const pagina = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">Cargos retenidos</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Cargos con retención formalizada (situación de revista «Retención de Cargo»), con su cargo
              remplazante (R/TTR) si ya se generó.
            </p>
          </div>
          {data && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-center shrink-0">
              <div className="text-lg font-bold text-amber-700">{todos.length}</div>
              <div className="text-xs text-amber-600">Retenidos</div>
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-3">
          <div className="relative w-72">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar por persona, CUIL, código, hospital..."
              className="h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 w-full"
            />
          </div>
          {busqueda && (
            <button
              className="h-9 px-3 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
              onClick={() => {
                setBusqueda('')
                setPage(1)
              }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado.</p>}

        {!isLoading && !isError && filtrados.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400">
            {busqueda ? 'Sin resultados para la búsqueda.' : 'No hay cargos retenidos.'}
          </p>
        )}

        {!isLoading && !isError && pagina.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Persona</th>
                  <th className="px-4 py-3 font-semibold">CUIL</th>
                  <th className="px-4 py-3 font-semibold">Cargo retenido</th>
                  <th className="px-4 py-3 font-semibold">Cargo actual</th>
                  <th className="px-4 py-3 font-semibold">Vence (cargo actual)</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagina.map((r) => {
                  const abierta = expandidas.has(r.persona.id)
                  const multiple = r.retenidos.length > 1
                  // Cargos retenidos a mostrar: si no está expandida, solo el 1º.
                  const retenidosVisibles = abierta ? r.retenidos : r.retenidos.slice(0, 1)
                  return (
                    <tr key={r.persona.id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                        {r.persona.apellidoNombre}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                        {r.persona.cuil}
                      </td>
                      {/* Cargo(s) retenido(s) — con señal expandible si hay más de uno */}
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          {retenidosVisibles.map((c) => (
                            <div key={c.ocupacionId}>
                              <p className="font-mono text-xs font-bold text-gray-800">
                                {c.codigo ?? '—'}
                              </p>
                              <p
                                className="text-xs text-gray-500 truncate max-w-[220px]"
                                title={`${c.literalPuesto ?? ''} · ${c.hospitalSigla} · ${c.escalafon}`}
                              >
                                {c.literalPuesto ?? '—'} · {c.hospitalSigla} · {c.escalafon}
                              </p>
                            </div>
                          ))}
                          {multiple && (
                            <button
                              onClick={() => toggleExpandir(r.persona.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition-colors"
                              title={abierta ? 'Ocultar' : 'Ver todos los cargos retenidos'}
                            >
                              {abierta ? '▲ Ocultar' : `▼ Retiene ${r.retenidos.length} cargos`}
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Cargo(s) actual(es) que ejerce */}
                      <td className="px-4 py-3">
                        {r.cargosActuales.length === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <div className="space-y-1">
                            {r.cargosActuales.map((c) => (
                              <div key={c.id} className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-gray-800">
                                  {c.codigo ?? '—'}
                                </span>
                                {c.tipoOrigen && (
                                  <span
                                    className={`text-[11px] px-1.5 py-0.5 rounded-full border ${
                                      c.tipoOrigen === 'TTR'
                                        ? 'bg-purple-100 text-purple-700 border-purple-200'
                                        : 'bg-blue-100 text-blue-700 border-blue-200'
                                    }`}
                                  >
                                    {c.tipoOrigen}
                                  </span>
                                )}
                                <span
                                  className="text-xs text-gray-500 truncate max-w-[160px]"
                                  title={`${c.literalPuesto ?? ''} · ${c.hospitalSigla}`}
                                >
                                  {c.literalPuesto ?? '—'} · {c.hospitalSigla}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      {/* Vencimiento — SOLO del cargo actual (los TTR vencen) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.cargosActuales.length === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <div className="space-y-1">
                            {r.cargosActuales.map((c) => (
                              <div key={c.id} className="text-xs">
                                {c.venceEl ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-amber-700"
                                    title={c.esConduccion ? 'Jefatura CPH: vence a los 4 años del inicio (renovable)' : undefined}
                                  >
                                    ⏳ {c.venceEl}
                                    {c.esConduccion && (
                                      <span className="text-[10px] text-gray-400">(+4 años)</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">No vence</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {r.retenidos[0]?.hospitalSigla ?? '—'}
                      </td>
                    </tr>
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
    </div>
  )
}
