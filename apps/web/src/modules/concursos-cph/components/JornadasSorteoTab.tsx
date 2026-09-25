import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEtiquetas } from '../hooks/useEtiquetas'
import {
  useJornadasSorteo,
  useJornadaSorteo,
  useCandidatosSorteo,
  useCrearJornadaSorteo,
} from '../hooks/useJornadasSorteo'

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Tab "Jornada de sorteos" dentro de ConcursosCphPage.
export function JornadasSorteoTab() {
  const [creando, setCreando] = useState(false)
  const [jornadaSel, setJornadaSel] = useState<string | undefined>(undefined)

  const { data: jornadas, isLoading } = useJornadasSorteo()

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-primary text-lg font-bold text-gray-900">Jornada de sorteos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Agendá un día para sortear jurados y elegí los concursos en estado de sorteo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCreando(true); setJornadaSel(undefined) }}
          className="h-10 px-4 rounded bg-secondary text-white text-sm font-semibold hover:opacity-90"
        >
          + Nueva jornada
        </button>
      </div>

      {creando && <NuevaJornada onClose={() => setCreando(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Listado de jornadas */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="font-primary text-base font-bold text-gray-900 mb-4">Jornadas</h2>
          {isLoading ? (
            <div className="h-24 bg-gray-100 rounded animate-pulse" />
          ) : (jornadas?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400">Todavía no hay jornadas creadas.</p>
          ) : (
            <div className="space-y-2">
              {jornadas!.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setJornadaSel(j.id)}
                  className={`w-full text-left border rounded px-3 py-2 transition-colors ${
                    jornadaSel === j.id ? 'border-secondary bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-800">{fmtFecha(j.fecha)}</span>
                    <span className="text-xs text-gray-500">{j.cantidadConcursos} concurso(s)</span>
                  </div>
                  {j.titulo && <p className="text-sm text-gray-600">{j.titulo}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detalle de la jornada seleccionada */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="font-primary text-base font-bold text-gray-900 mb-4">Detalle</h2>
          {jornadaSel ? (
            <DetalleJornada id={jornadaSel} />
          ) : (
            <p className="text-sm text-gray-400">Elegí una jornada para ver los concursos agendados.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Detalle de una jornada ──────────────────────────────────────────────────
function DetalleJornada({ id }: { id: string }) {
  const { data: jornada, isLoading } = useJornadaSorteo(id)
  if (isLoading) return <div className="h-24 bg-gray-100 rounded animate-pulse" />
  if (!jornada) return <p className="text-sm text-gray-400">No se encontró la jornada.</p>

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold text-gray-900">{fmtFecha(jornada.fecha)}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{jornada.estado}</span>
      </div>
      {jornada.titulo && <p className="text-sm text-gray-700">{jornada.titulo}</p>}
      {jornada.observaciones && <p className="text-xs text-gray-500">{jornada.observaciones}</p>}

      {/* Progreso de la jornada: confirmados / total */}
      <ProgresoJornada concursos={jornada.concursos} />

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-500 mb-2">Concursos a sortear ({jornada.concursos.length})</p>
        <div className="space-y-2">
          {jornada.concursos.map((c) => (
            <Link
              key={c.id}
              to={`/concursos/cph/${c.id}/wizard`}
              className="block border border-gray-200 rounded px-3 py-2 text-sm hover:border-secondary hover:bg-blue-50 transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-800">{c.cargoCodigo ?? '—'}</span>
                <BadgeAvance avance={c.avanceSorteo} />
              </div>
              <p className="text-gray-600">{c.literalPuesto ?? '—'}</p>
              <div className="flex justify-between items-center">
                {c.especialidadSolicitada
                  ? <span className="text-xs text-gray-400">{c.especialidadSolicitada}</span>
                  : <span />}
                <span className="text-xs text-secondary">Ir a sortear →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// Barra de progreso de la jornada: cuántos sorteos están confirmados.
function ProgresoJornada({ concursos }: { concursos: { avanceSorteo: string }[] }) {
  const total = concursos.length
  const confirmados = concursos.filter((c) => c.avanceSorteo === 'confirmado').length
  const sorteados = concursos.filter((c) => c.avanceSorteo === 'sorteado').length
  const pct = total > 0 ? Math.round((confirmados / total) * 100) : 0

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>Avance de la jornada</span>
        <span className="font-semibold">{confirmados} de {total} confirmados</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-3 mt-2 text-xs text-gray-500">
        <span>✅ {confirmados} confirmados</span>
        <span>🕓 {sorteados} sorteados (borrador)</span>
        <span>⬜ {total - confirmados - sorteados} pendientes</span>
      </div>
    </div>
  )
}

// Badge del estado de avance del sorteo de un concurso.
function BadgeAvance({ avance }: { avance: 'pendiente' | 'sorteado' | 'confirmado' }) {
  const cfg = {
    confirmado: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
    sorteado: { label: 'Sorteado (borrador)', cls: 'bg-amber-100 text-amber-700' },
    pendiente: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-500' },
  }[avance]
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
}

// ─── Formulario de nueva jornada ─────────────────────────────────────────────
function NuevaJornada({ onClose }: { onClose: () => void }) {
  const [fecha, setFecha] = useState('')
  const [titulo, setTitulo] = useState('')
  const [etiquetaId, setEtiquetaId] = useState('')
  const [fPuesto, setFPuesto] = useState('')
  const [fEspecialidad, setFEspecialidad] = useState('')
  const [fSigla, setFSigla] = useState('')
  const [fExpediente, setFExpediente] = useState('')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())

  const { data: etiquetas } = useEtiquetas()
  const { data: candidatos, isLoading } = useCandidatosSorteo(etiquetaId || undefined)
  const crear = useCrearJornadaSorteo()

  // Filtro por texto (puesto / especialidad / sigla) sobre los candidatos ya
  // traídos. Se normaliza sin acentos y en minúsculas para búsqueda tolerante.
  const norm = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const candidatosFiltrados = useMemo(() => {
    const p = norm(fPuesto), e = norm(fEspecialidad), s = norm(fSigla), x = norm(fExpediente)
    return (candidatos ?? []).filter((c) =>
      (!p || norm(c.literalPuesto).includes(p)) &&
      (!e || norm(c.especialidadSolicitada).includes(e)) &&
      (!s || norm(c.hospitalSigla).includes(s)) &&
      (!x || norm(c.eeConcurso).includes(x) || norm(c.cargoCodigo).includes(x))
    )
  }, [candidatos, fPuesto, fEspecialidad, fSigla, fExpediente])

  const idsCandidatos = useMemo(() => candidatosFiltrados.map((c) => c.id), [candidatosFiltrados])
  const todosSeleccionados = idsCandidatos.length > 0 && idsCandidatos.every((id) => seleccion.has(id))

  function toggle(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    setSeleccion((prev) => {
      if (todosSeleccionados) {
        const next = new Set(prev)
        idsCandidatos.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...prev, ...idsCandidatos])
    })
  }

  async function guardar() {
    if (!fecha || seleccion.size === 0) return
    await crear.mutateAsync({
      fecha,
      titulo: titulo.trim() || undefined,
      concursoCphIds: [...seleccion],
    })
    onClose()
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border-2 border-secondary p-6 space-y-4">
      <h2 className="font-primary text-base font-bold text-gray-900">Nueva jornada de sorteos</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fecha *</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Título (opcional)</label>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej: Sorteo marzo"
            className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Filtrar por etiqueta</label>
          <select
            value={etiquetaId}
            onChange={(e) => setEtiquetaId(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary"
          >
            <option value="">Todas</option>
            {etiquetas?.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filtros de búsqueda de cargos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Puesto</label>
          <input
            type="text"
            value={fPuesto}
            onChange={(e) => setFPuesto(e.target.value)}
            placeholder="Buscar puesto…"
            className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Especialidad</label>
          <input
            type="text"
            value={fEspecialidad}
            onChange={(e) => setFEspecialidad(e.target.value)}
            placeholder="Buscar especialidad…"
            className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Efector (sigla)</label>
          <input
            type="text"
            value={fSigla}
            onChange={(e) => setFSigla(e.target.value)}
            placeholder="Buscar sigla…"
            className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Expediente / código</label>
          <input
            type="text"
            value={fExpediente}
            onChange={(e) => setFExpediente(e.target.value)}
            placeholder="Buscar expediente…"
            className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary"
          />
        </div>
      </div>

      {/* Candidatos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500">
            Concursos en estado de sorteo ({candidatosFiltrados.length}
            {candidatos && candidatosFiltrados.length !== candidatos.length ? ` de ${candidatos.length}` : ''})
            {' '}— seleccionados: {seleccion.size}
          </p>
          {idsCandidatos.length > 0 && (
            <button type="button" onClick={toggleTodos} className="text-xs text-secondary hover:underline">
              {todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="h-24 bg-gray-100 rounded animate-pulse" />
        ) : candidatosFiltrados.length === 0 ? (
          <p className="text-sm text-gray-400">
            {(candidatos?.length ?? 0) === 0
              ? 'No hay concursos en estado de sorteo (B-SORTEO JUR) para este filtro.'
              : 'Ningún concurso coincide con los filtros de búsqueda.'}
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded divide-y divide-gray-100">
            {candidatosFiltrados.map((c) => (
              <label key={c.id} className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seleccion.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium text-gray-800">{c.cargoCodigo ?? '—'}</span>
                  <span className="text-gray-500"> · {c.hospitalSigla}</span>
                  <span className="block text-gray-600">{c.literalPuesto ?? '—'}</span>
                  {c.especialidadSolicitada && (
                    <span className="block text-xs text-gray-400">{c.especialidadSolicitada}</span>
                  )}
                  {c.eeConcurso && (
                    <span className="block text-xs text-gray-400">EE: {c.eeConcurso}</span>
                  )}
                  {c.etiquetas.length > 0 && (
                    <span className="block text-xs text-gray-400">
                      {c.etiquetas.map((et) => et.nombre).join(', ')}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {crear.isError && (
        <p className="text-sm text-danger">No se pudo crear la jornada. Revisá los concursos elegidos.</p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 px-4 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!fecha || seleccion.size === 0 || crear.isPending}
          className="h-10 px-4 rounded bg-secondary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {crear.isPending ? 'Creando…' : 'Crear jornada'}
        </button>
      </div>
    </div>
  )
}
