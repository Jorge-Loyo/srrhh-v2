import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { JornadaSorteoDetalle } from '@srrhh/types'
import { useEtiquetas } from '../hooks/useEtiquetas'
import {
  useJornadasSorteo,
  useJornadaSorteo,
  useCandidatosSorteo,
  useCrearJornadaSorteo,
  useCambiarEstadoJornada,
} from '../hooks/useJornadasSorteo'
import { useConfirm } from '@/shared/components/ui/useConfirm'
import { useToast } from '@/shared/components/ui/useToast'

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Tab "Jornada de sorteos" dentro de ConcursosCphPage.
// Dos vistas dentro del mismo tab (estado local, sin ruta nueva):
//   - lista:   todas las jornadas como tarjetas a ancho completo.
//   - detalle: pantalla dedicada de una jornada (al tocar una tarjeta).
export function JornadasSorteoTab() {
  const [creando, setCreando] = useState(false)
  const [jornadaSel, setJornadaSel] = useState<string | undefined>(undefined)

  // Vista de detalle a pantalla completa (reemplaza la lista mientras hay una
  // jornada seleccionada). El botón "Volver" limpia la selección.
  if (jornadaSel) {
    return <DetalleJornada id={jornadaSel} onVolver={() => setJornadaSel(undefined)} />
  }

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

      <ListaJornadas onAbrir={(id) => { setCreando(false); setJornadaSel(id) }} />
    </div>
  )
}

// ─── Lista de jornadas (ancho completo, tarjetas clickeables) ────────────────
function ListaJornadas({ onAbrir }: { onAbrir: (id: string) => void }) {
  const { data: jornadas, isLoading } = useJornadasSorteo()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if ((jornadas?.length ?? 0) === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-dashed border-gray-300 p-10 text-center">
        <p className="text-4xl mb-2">🗓️</p>
        <p className="text-sm font-medium text-gray-600">Todavía no hay jornadas creadas.</p>
        <p className="text-xs text-gray-400 mt-1">
          Usá «+ Nueva jornada» para agendar un día de sorteos.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {jornadas!.map((j) => (
        <button
          key={j.id}
          type="button"
          onClick={() => onAbrir(j.id)}
          className="group text-left bg-white rounded-lg shadow-sm border border-gray-200 p-5 transition-all hover:border-secondary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-secondary/40"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-lg font-bold text-gray-900">📅 {fmtFecha(j.fecha)}</span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {j.cantidadConcursos} concurso(s)
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            {j.estado === 'finalizada' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                🔒 Cerrada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                🟢 Abierta
              </span>
            )}
            {j.titulo && <span className="truncate text-sm text-gray-600">{j.titulo}</span>}
          </div>
          <p className="mt-3 text-xs font-medium text-secondary opacity-0 transition-opacity group-hover:opacity-100">
            Abrir jornada →
          </p>
        </button>
      ))}
    </div>
  )
}

// Badge del estado de la jornada.
function BadgeEstadoJornada({ estado }: { estado: string }) {
  const cerrada = estado === 'finalizada'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
        cerrada
          ? 'bg-gray-200 text-gray-600'
          : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      {cerrada ? '🔒 Cerrada' : '🟢 Abierta'}
    </span>
  )
}

// ─── Detalle de una jornada (pantalla completa) ──────────────────────────────
function DetalleJornada({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { data: jornada, isLoading } = useJornadaSorteo(id)
  const cambiarEstado = useCambiarEstadoJornada()
  const { confirm, ConfirmUI } = useConfirm()
  const { toast, ToastUI } = useToast()

  // Filtros de la lista de concursos de la jornada.
  const [fSigla, setFSigla] = useState('')
  const [fEspecialidad, setFEspecialidad] = useState('')

  const cerrada = jornada?.estado === 'finalizada'
  const sinSortear = jornada
    ? jornada.concursos.filter((c) => c.avanceSorteo === 'pendiente').length
    : 0

  const norm = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  // Concursos que pasan los filtros de texto (sigla + especialidad).
  const concursosFiltrados = useMemo(() => {
    if (!jornada) return []
    const s = norm(fSigla)
    const e = norm(fEspecialidad)
    return jornada.concursos.filter(
      (c) =>
        (!s || norm(c.hospitalSigla).includes(s)) &&
        (!e || norm(c.especialidadSolicitada).includes(e)),
    )
  }, [jornada, fSigla, fEspecialidad])

  // Agrupación jerárquica: Conducción / Ejecución → (POU|POF) → (Médicos|No médicos).
  const grupos = useMemo(() => agruparConcursos(concursosFiltrados), [concursosFiltrados])

  async function toggleEstado() {
    if (!jornada) return
    if (cerrada) {
      const ok = await confirm({
        titulo: 'Reabrir jornada',
        mensaje: 'La jornada volverá a estar abierta y se podrán seguir sorteando sus concursos. ¿Continuar?',
      })
      if (!ok) return
      cambiarEstado.mutate(
        { id, estado: 'planificada' },
        {
          onSuccess: () => toast.success('Jornada reabierta.'),
          onError: () => toast.error('No se pudo reabrir la jornada.'),
        },
      )
      return
    }
    const ok = await confirm({
      titulo: 'Cerrar jornada',
      mensaje:
        sinSortear > 0
          ? `Quedan ${sinSortear} concurso(s) sin sortear. Al cerrar la jornada no se pierden: siguen en estado de sorteo y podés agendarlos en otra jornada. ¿Cerrar de todas formas?`
          : 'La jornada quedará cerrada y ya no se sortearán concursos ahí. ¿Continuar?',
    })
    if (!ok) return
    cambiarEstado.mutate(
      { id, estado: 'finalizada' },
      {
        onSuccess: () => toast.success('Jornada cerrada.'),
        onError: () => toast.error('No se pudo cerrar la jornada.'),
      },
    )
  }

  return (
    <div className="space-y-6">
      {ConfirmUI}
      {ToastUI}

      {/* Barra superior con volver */}
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary hover:underline"
      >
        ← Volver a jornadas
      </button>

      {isLoading ? (
        <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
      ) : !jornada ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-400">No se encontró la jornada.</p>
        </div>
      ) : (
        <>
          {/* Encabezado de la jornada */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-primary text-2xl font-bold text-gray-900">
                  📅 {fmtFecha(jornada.fecha)}
                </h2>
                {jornada.titulo && (
                  <p className="mt-1 text-base font-medium text-gray-700">{jornada.titulo}</p>
                )}
                {jornada.observaciones && (
                  <p className="mt-1 text-sm text-gray-500">{jornada.observaciones}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <BadgeEstadoJornada estado={jornada.estado} />
                <button
                  type="button"
                  onClick={toggleEstado}
                  disabled={cambiarEstado.isPending}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 ${
                    cerrada
                      ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      : 'bg-secondary text-white hover:opacity-90'
                  }`}
                >
                  {cambiarEstado.isPending
                    ? 'Guardando…'
                    : cerrada
                      ? '🔓 Reabrir jornada'
                      : '🔒 Cerrar jornada'}
                </button>
              </div>
            </div>

            {/* Aviso cuando la jornada está cerrada */}
            {cerrada && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <span aria-hidden>🔒</span>
                <span>
                  Jornada cerrada. Los concursos que no se sortearon siguen en estado de sorteo y
                  pueden agendarse en otra jornada.
                </span>
              </div>
            )}

            {/* Progreso de la jornada: confirmados / total */}
            <div className="mt-4">
              <ProgresoJornada concursos={jornada.concursos} />
            </div>
          </div>

          {/* Concursos a sortear */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-sm font-semibold text-gray-700">
                Concursos a sortear ({concursosFiltrados.length}
                {concursosFiltrados.length !== jornada.concursos.length
                  ? ` de ${jornada.concursos.length}`
                  : ''}
                )
              </p>
              {/* Filtros sigla + especialidad */}
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={fSigla}
                  onChange={(e) => setFSigla(e.target.value)}
                  placeholder="🏥 Filtrar por sigla…"
                  className="h-9 w-44 rounded border border-gray-300 px-3 text-sm focus:border-secondary focus:outline-none"
                />
                <input
                  type="text"
                  value={fEspecialidad}
                  onChange={(e) => setFEspecialidad(e.target.value)}
                  placeholder="🩺 Filtrar por especialidad…"
                  className="h-9 w-52 rounded border border-gray-300 px-3 text-sm focus:border-secondary focus:outline-none"
                />
                {(fSigla || fEspecialidad) && (
                  <button
                    type="button"
                    onClick={() => { setFSigla(''); setFEspecialidad('') }}
                    className="h-9 rounded px-3 text-sm text-gray-500 hover:bg-gray-100"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {jornada.concursos.length === 0 ? (
              <p className="text-sm text-gray-400">Esta jornada no tiene concursos agendados.</p>
            ) : concursosFiltrados.length === 0 ? (
              <p className="text-sm text-gray-400">Ningún concurso coincide con los filtros.</p>
            ) : (
              <div className="space-y-5">
                {grupos.map((g) => (
                  <GrupoConcursos key={g.key} grupo={g} cerrada={cerrada} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Agrupación de concursos ─────────────────────────────────────────────────
// Conducción (un solo bloque) y Ejecución dividida por modalidad (Guardia POU /
// Planta POF) y dentro de cada una por Médicos / No médicos.
type ConcursoJornada = JornadaSorteoDetalle['concursos'][number]

interface SubGrupo {
  key: string
  label: string
  concursos: ConcursoJornada[]
}
interface Grupo {
  key: string
  label: string
  icono: string
  subgrupos: SubGrupo[]
}

function agruparConcursos(concursos: ConcursoJornada[]): Grupo[] {
  const conduccion = concursos.filter((c) => c.tipoCargo === 'conduccion')
  const ejecucion = concursos.filter((c) => c.tipoCargo === 'ejecucion')

  const grupos: Grupo[] = []

  if (conduccion.length > 0) {
    // Conducción: sin subdividir por POU/POF, solo médicos / no médicos.
    grupos.push({
      key: 'conduccion',
      label: 'Conducción',
      icono: '👔',
      subgrupos: subgruposMedico(conduccion, 'cond'),
    })
  }

  if (ejecucion.length > 0) {
    const subgrupos: SubGrupo[] = []
    const pou = ejecucion.filter((c) => c.modalidad === 'pou')
    const pof = ejecucion.filter((c) => c.modalidad === 'pof')
    for (const [mod, label, arr] of [
      ['pou', 'Guardia (POU)', pou],
      ['pof', 'Planta (POF)', pof],
    ] as const) {
      if (arr.length === 0) continue
      // Dentro de cada modalidad: médicos / no médicos.
      for (const sg of subgruposMedico(arr, `ejec-${mod}`)) {
        subgrupos.push({ ...sg, label: `${label} · ${sg.label}` })
      }
    }
    grupos.push({ key: 'ejecucion', label: 'Ejecución', icono: '🩺', subgrupos })
  }

  return grupos
}

function subgruposMedico(arr: ConcursoJornada[], prefix: string): SubGrupo[] {
  const medicos = arr.filter((c) => c.esMedico)
  const noMedicos = arr.filter((c) => !c.esMedico)
  const out: SubGrupo[] = []
  if (medicos.length > 0) out.push({ key: `${prefix}-med`, label: 'Médicos', concursos: medicos })
  if (noMedicos.length > 0)
    out.push({ key: `${prefix}-nomed`, label: 'No médicos', concursos: noMedicos })
  return out
}

function GrupoConcursos({ grupo, cerrada }: { grupo: Grupo; cerrada: boolean }) {
  const total = grupo.subgrupos.reduce((n, s) => n + s.concursos.length, 0)
  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 rounded-t-lg border-b border-gray-100 bg-gray-50 px-4 py-2">
        <span aria-hidden>{grupo.icono}</span>
        <span className="text-sm font-bold text-gray-800">{grupo.label}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-500">
          {total}
        </span>
      </div>
      <div className="space-y-4 p-4">
        {grupo.subgrupos.map((sg) => (
          <div key={sg.key}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {sg.label} ({sg.concursos.length})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sg.concursos.map((c) => (
                <ConcursoCard key={c.id} c={c} cerrada={cerrada} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConcursoCard({ c, cerrada }: { c: ConcursoJornada; cerrada: boolean }) {
  return (
    <Link
      to={`/concursos/cph/${c.id}/wizard`}
      className="block border border-gray-200 rounded-lg px-4 py-3 text-sm transition-colors hover:border-secondary hover:bg-blue-50"
    >
      <div className="flex justify-between items-center gap-2">
        <span className="font-semibold text-gray-800">{c.cargoCodigo ?? '—'}</span>
        <BadgeAvance avance={c.avanceSorteo} />
      </div>
      <p className="mt-0.5 text-gray-600">{c.literalPuesto ?? '—'}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400">
        {c.hospitalSigla && <span>🏥 {c.hospitalSigla}</span>}
        {c.especialidadSolicitada && <span>🩺 {c.especialidadSolicitada}</span>}
      </div>
      <div className="mt-1 flex justify-end">
        <span className="text-xs font-medium text-secondary">
          {cerrada ? 'Ver concurso →' : 'Ir a sortear →'}
        </span>
      </div>
    </Link>
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
