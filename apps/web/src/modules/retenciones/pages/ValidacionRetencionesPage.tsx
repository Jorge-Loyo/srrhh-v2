import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { CandidatoRetencion, CargoValidacionRetencion, RegistrarRetencionRequest } from '@srrhh/types'
import { useValidacionRetenciones } from '../hooks/useCadenaRetencion'

interface Confirmando {
  persona: CandidatoRetencion['persona']
  cargo: CargoValidacionRetencion
}

const PAGE_SIZE = 30

export function ValidacionRetencionesPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useValidacionRetenciones()

  const [confirmando, setConfirmando] = useState<Confirmando | null>(null)
  const [srDocRespaldo, setSrDocRespaldo] = useState('')
  const [srComentario, setSrComentario] = useState('')
  const [periodoDesde, setPeriodoDesde] = useState('')
  const [periodoHasta, setPeriodoHasta] = useState('')
  const [formError, setFormError] = useState('')

  const [busqueda, setBusqueda] = useState('')
  const [escalafon, setEscalafon] = useState('')
  const [page, setPage] = useState(1)

  const confirmar = useMutation({
    mutationFn: (body: RegistrarRetencionRequest) => apiClient.post('/api/v1/retenciones', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['validacion-retenciones'] })
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
      cerrarModal()
    },
    onError: (e: any) => {
      setFormError(e?.response?.data?.error?.message ?? e?.message ?? 'No se pudo registrar la retención.')
    },
  })

  function abrirModal(persona: CandidatoRetencion['persona'], cargo: CargoValidacionRetencion) {
    setConfirmando({ persona, cargo })
    setSrDocRespaldo('')
    setSrComentario('')
    setPeriodoDesde('')
    setPeriodoHasta('')
    setFormError('')
  }

  function cerrarModal() {
    setConfirmando(null)
    setSrDocRespaldo('')
    setSrComentario('')
    setPeriodoDesde('')
    setPeriodoHasta('')
    setFormError('')
  }

  function confirmarSubmit() {
    if (!confirmando || !srDocRespaldo.trim()) return
    setFormError('')
    confirmar.mutate({
      cargoId: confirmando.cargo.id,
      srDocRespaldo: srDocRespaldo.trim(),
      srComentario: srComentario.trim() || undefined,
      periodoDesde: periodoDesde || undefined,
      periodoHasta: periodoHasta || undefined,
    })
  }

  const todos = data ?? []
  const q = busqueda.toLowerCase().trim()

  const filtrados = todos.filter((c) => {
    const cargoEnEscalafon = !escalafon || c.cargos.some((cg) => cg.escalafon.nombre === escalafon)
    if (!cargoEnEscalafon) return false
    if (!q) return true
    return (
      c.persona.apellidoNombre.toLowerCase().includes(q) ||
      c.persona.cuil.includes(q) ||
      c.cargos.some((cg) =>
        cg.codigo?.toLowerCase().includes(q) ||
        cg.hospital.sigla.toLowerCase().includes(q) ||
        cg.hospital.nombre.toLowerCase().includes(q)
      )
    )
  })

  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE)
  // Clampear contra totalPages — la lista se achica cada vez que se confirma
  // una retención (invalidateQueries), así que `page` puede quedar apuntando
  // más allá del final y dejar la tabla en blanco sin forma de volver.
  const paginaActual = totalPages === 0 ? 1 : Math.min(page, totalPages)
  const pagina = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)

  return (
    <div className="space-y-4">

      {/* Modal confirmar */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="font-bold text-gray-900">Confirmar retención</h3>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
              <p><span className="text-gray-500">Persona:</span> <span className="font-medium">{confirmando.persona.apellidoNombre}</span></p>
              <p><span className="text-gray-500">CUIL:</span> <span className="font-mono">{confirmando.persona.cuil}</span></p>
              <p><span className="text-gray-500">Cargo a retener:</span> <span className="font-mono font-bold">{confirmando.cargo.codigo ?? '—'}</span></p>
              <p><span className="text-gray-500">Puesto:</span> {confirmando.cargo.literalPuesto ?? '—'}</p>
              <p><span className="text-gray-500">Hospital:</span> {confirmando.cargo.hospital.sigla}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Documento de respaldo <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={srDocRespaldo}
                onChange={(e) => setSrDocRespaldo(e.target.value)}
                placeholder="Ej: EX-2026-1234-GCABA-DGAYDRH"
                className="h-10 input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Comentario <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={srComentario}
                onChange={(e) => setSrComentario(e.target.value)}
                className="h-10 input w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Período desde <span className="text-gray-400 font-normal">(si es conducción)</span>
                </label>
                <input type="date" value={periodoDesde} onChange={(e) => setPeriodoDesde(e.target.value)} className="h-10 input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Período hasta <span className="text-gray-400 font-normal">(si es conducción)</span>
                </label>
                <input type="date" value={periodoHasta} onChange={(e) => setPeriodoHasta(e.target.value)} className="h-10 input w-full" />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Si el cargo resulta ser de conducción (jefatura/dirección), el período es obligatorio — si no lo
              completás, el sistema va a pedírtelo al confirmar.
            </p>
            {formError && (
              <p className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
            )}
            <div className="flex gap-3">
              <button className="btn-outline flex-1" onClick={cerrarModal}>Cancelar</button>
              <button
                className="btn-primary flex-1"
                disabled={confirmar.isPending || !srDocRespaldo.trim()}
                onClick={confirmarSubmit}
              >
                {confirmar.isPending ? 'Confirmando...' : 'Confirmar retención'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">Validación de Retenciones</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Personas con más de un cargo activo simultáneo, sin que ninguno esté formalizado como retención ni
              comisión — revisá cuál corresponde retener.
            </p>
          </div>
          {data && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-center shrink-0">
              <div className="text-lg font-bold text-amber-700">{todos.length}</div>
              <div className="text-xs text-amber-600">Sin resolver</div>
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-3">
          <div className="relative w-72">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPage(1) }}
              placeholder="Buscar por persona, CUIL, código, hospital..."
              className="h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 w-full"
            />
          </div>
          <select
            value={escalafon}
            onChange={(e) => { setEscalafon(e.target.value); setPage(1) }}
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 text-gray-700 bg-white"
          >
            <option value="">Todos los escalafones</option>
            <option value="CEETPS">CEETPS</option>
            <option value="Nueva Carrera Administrativa">Nueva Carrera Administrativa</option>
            <option value="Nueva Carrera Enfermería">Nueva Carrera Enfermería</option>
            <option value="Nueva Carrera Profesional Hospitalaria">Nueva Carrera Profesional Hospitalaria</option>
            <option value="Salud - Guardias">Salud - Guardias</option>
            <option value="Escalafón General">Escalafón General</option>
            <option value="Carrera Gerencial">Carrera Gerencial</option>
            <option value="Cuerpo Especialistas Profesionales">Cuerpo Especialistas Profesionales</option>
            <option value="Docentes">Docentes</option>
            <option value="Docentes Históricos">Docentes Históricos</option>
            <option value="Médicos">Médicos</option>
            <option value="Planta Transitoria">Planta Transitoria</option>
            <option value="Planta de Gabinete">Planta de Gabinete</option>
            <option value="Plantas Transitorias Acta 06/2014">Plantas Transitorias Acta 06/2014</option>
            <option value="Plantas Transitorias Modulo Operativo">Plantas Transitorias Modulo Operativo</option>
            <option value="Residentes">Residentes</option>
            <option value="Régimen Modular Extraordinario PG">Régimen Modular Extraordinario PG</option>
            <option value="Autoridades Superiores">Autoridades Superiores</option>
            <option value="Gabinete">Gabinete</option>
          </select>
          {(busqueda || escalafon) && (
            <button
              className="h-9 px-3 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
              onClick={() => { setBusqueda(''); setEscalafon(''); setPage(1) }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        <span className="mt-0.5 shrink-0">⚠</span>
        <span>
          No todos estos casos son retenciones reales — algunos son dobles nombramientos legítimos (ej. residentes
          con un cargo docente en paralelo). Revisá cada uno antes de confirmar.
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado.</p>}

        {!isLoading && !isError && filtrados.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400">
            {busqueda || escalafon ? 'Sin resultados para el filtro aplicado.' : 'No hay casos sin resolver.'}
          </p>
        )}

        {!isLoading && !isError && pagina.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Persona</th>
                  <th className="px-4 py-3 font-semibold">CUIL</th>
                  <th className="px-4 py-3 font-semibold">Cargos activos simultáneos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagina.map((c) => (
                  <tr key={c.persona.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{c.persona.apellidoNombre}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">{c.persona.cuil}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        {c.cargos.map((cargo) => (
                          <div key={cargo.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-bold text-gray-800">{cargo.codigo ?? '—'}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {cargo.literalPuesto ?? '—'} · {cargo.hospital.sigla} · {cargo.escalafon.nombre}
                              </p>
                            </div>
                            <button
                              className="btn-primary text-xs px-3 py-1 shrink-0"
                              onClick={() => abrirModal(c.persona, cargo)}
                            >
                              Confirmar retención
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Página {paginaActual} de {totalPages} — {filtrados.length} en total</span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={paginaActual <= 1} onClick={() => setPage(paginaActual - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={paginaActual >= totalPages} onClick={() => setPage(paginaActual + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
