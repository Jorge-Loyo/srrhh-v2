import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import {
  useGestionPuestosPendientes,
  useCrearCargo,
  useVincularConcurso,
  useTransferencia,
  useSinCodigo,
  useCrearConcurso,
  buscarConcursosParaPendiente,
  type PendienteItem,
  type ConcursoCandidato,
  type CrearConcursoBody,
} from '../hooks/useGestionPuestos'

// Sub-pestañas: con/sin concurso. Se derivan del diagnóstico que trae el
// backend por fila (diagnostico.concursoCphId presente = genera concurso),
// misma lógica ingreso/cambio_rol que el padrón expone en el diagnóstico.
type FiltroConcurso = 'todos' | 'con_concurso' | 'sin_concurso'

const FILTROS: { key: FiltroConcurso; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'con_concurso', label: 'Con concurso' },
  { key: 'sin_concurso', label: 'Sin concurso' },
]

const TIPO_CONCURSO_OPCIONES = [
  { value: 'cph', label: 'CPH' },
  { value: 'ceetps', label: 'CEETPS' },
  { value: 'sin_concurso', label: 'Sin concurso' },
]

type Feedback = { tipo: 'ok' | 'error'; texto: string } | null

export function GestionPuestosPage() {
  const { user } = useAuth()
  const puedeGestionar = can(user, 'gestion-puestos', 'gestionar')

  const { data, isLoading, isError } = useGestionPuestosPendientes()
  const crearCargo = useCrearCargo()
  const vincularConcurso = useVincularConcurso()
  const transferencia = useTransferencia()
  const sinCodigo = useSinCodigo()
  const crearConcurso = useCrearConcurso()

  const [filtro, setFiltro] = useState<FiltroConcurso>('todos')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busyDiffId, setBusyDiffId] = useState<string | null>(null)

  // Modal de búsqueda/vinculación de concurso
  const [modalConcurso, setModalConcurso] = useState<PendienteItem | null>(null)
  const [concursoSearch, setConcursoSearch] = useState('')
  const [concursoResultados, setConcursoResultados] = useState<ConcursoCandidato[]>([])
  const [concursoLoading, setConcursoLoading] = useState(false)
  const concursoSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modal de creación de concurso
  const [modalCrear, setModalCrear] = useState<PendienteItem | null>(null)

  // Búsqueda de concursos con debounce cuando el modal está abierto.
  useEffect(() => {
    if (!modalConcurso) return
    if (concursoSearchRef.current) clearTimeout(concursoSearchRef.current)
    concursoSearchRef.current = setTimeout(async () => {
      setConcursoLoading(true)
      try {
        setConcursoResultados(await buscarConcursosParaPendiente(modalConcurso.diffId, concursoSearch))
      } catch {
        setConcursoResultados([])
      } finally {
        setConcursoLoading(false)
      }
    }, 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concursoSearch, modalConcurso])

  function abrirModalConcurso(item: PendienteItem) {
    setConcursoSearch('')
    setConcursoResultados([])
    setModalConcurso(item)
  }

  function cerrarModalConcurso() {
    setModalConcurso(null)
    setConcursoSearch('')
    setConcursoResultados([])
  }

  // Ejecuta una acción, muestra feedback y marca la fila ocupada mientras corre.
  async function ejecutar(diffId: string, accion: () => Promise<unknown>, okMsg: string) {
    setBusyDiffId(diffId)
    setFeedback(null)
    try {
      await accion()
      setFeedback({ tipo: 'ok', texto: okMsg })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setFeedback({ tipo: 'error', texto: err?.response?.data?.message ?? 'No se pudo completar la acción. Volvé a intentar.' })
    } finally {
      setBusyDiffId(null)
    }
  }

  if (isLoading) return <p className="text-sm text-gray-400">Cargando cola de pendientes...</p>
  if (isError) return <p className="text-sm text-danger">No se pudo cargar la cola de Gestión de Puestos.</p>
  if (!data) return null

  const { pendientes, resumen } = data
  const pendientesFiltrados = pendientes.filter((p) => {
    if (filtro === 'con_concurso') return p.diagnostico?.concursoCphId != null
    if (filtro === 'sin_concurso') return p.diagnostico?.concursoCphId == null
    return true
  })

  const CONTEOS: Record<FiltroConcurso, number> = {
    todos: resumen.total,
    con_concurso: resumen.conConcurso,
    sin_concurso: resumen.sinConcurso,
  }

  return (
    <>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-primary text-xl font-bold text-gray-900">Gestión de Puestos</h1>
              <p className="text-sm text-gray-500">
                Id_sial nuevos pendientes de gestionar tras aprobar el padrón. Cada fila es una
                persona en un puesto; acá se decide cómo se le asigna el cargo.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-bold">
                {resumen.total} pendientes
              </span>
            </div>
          </div>
        </div>

        {/* Feedback de la última acción */}
        {feedback && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              feedback.tipo === 'ok'
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-red-300 bg-red-50 text-red-700'
            }`}
          >
            {feedback.texto}
          </div>
        )}

        {/* Sub-pestañas con/sin concurso */}
        <div className="border-b border-gray-200 flex gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                filtro === f.key
                  ? 'border-primary text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label} <span className="text-gray-400">({CONTEOS[f.key]})</span>
            </button>
          ))}
        </div>

        {/* Tabla de pendientes */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {pendientesFiltrados.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              No hay id_sial pendientes para este filtro.
            </p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold rounded-tl-lg">ID SIAL</th>
                  <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Carrera</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  <th className="px-4 py-3 font-semibold">Concurso</th>
                  <th className="px-4 py-3 rounded-tr-lg" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendientesFiltrados.map((p) => {
                  const v = p.valorNuevo
                  const tieneConcurso = p.diagnostico?.concursoCphId != null
                  const busy = busyDiffId === p.diffId
                  return (
                    <tr key={p.diffId} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{v.idSial ?? p.idSialRol}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{v.ayn ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.siglas ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.escalafon ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.literalPuesto ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.especialidad ?? '—'}</td>
                      <td className="px-4 py-3">
                        {tieneConcurso ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                            Genera concurso
                            {p.diagnostico?.concursoCodigo ? `: ${p.diagnostico.concursoCodigo}` : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                            Sin concurso
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {puedeGestionar && (
                          <div className="flex flex-col items-end gap-1.5">
                            {/* Aviso de baja asociada: exige atención antes de crear el cargo. */}
                            {p.tieneBajaAsociada && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                ⚠ Baja asociada — revisá antes de crear el cargo
                              </span>
                            )}
                            <div className="flex flex-wrap justify-end gap-1">
                              <button
                                className="btn-primary text-xs px-2 py-1"
                                disabled={busy}
                                onClick={() =>
                                  ejecutar(p.diffId, () => crearCargo.mutateAsync(p.diffId), 'Cargo creado.')
                                }
                              >
                                Crear cargo
                              </button>
                              <button
                                className="text-xs px-2 py-1 rounded border font-medium transition-colors bg-green-50 border-green-300 text-green-700 hover:bg-green-100 disabled:opacity-50"
                                disabled={busy}
                                onClick={() => abrirModalConcurso(p)}
                              >
                                Vincular a concurso
                              </button>
                              <button
                                className="text-xs px-2 py-1 rounded border font-medium transition-colors bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                                disabled={busy}
                                onClick={() => setModalCrear(p)}
                              >
                                Crear concurso
                              </button>
                              <button
                                className="text-xs px-2 py-1 rounded border font-medium transition-colors bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                disabled={busy}
                                onClick={() =>
                                  ejecutar(p.diffId, () => transferencia.mutateAsync(p.diffId), 'Marcado como transferencia.')
                                }
                              >
                                Transferencia
                              </button>
                              <button
                                className="btn-outline text-xs px-2 py-1"
                                disabled={busy}
                                onClick={() =>
                                  ejecutar(p.diffId, () => sinCodigo.mutateAsync(p.diffId), 'Cargo creado sin código.')
                                }
                              >
                                Sin código
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: vincular a concurso existente */}
      {modalConcurso && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModalConcurso()
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-primary text-lg font-bold text-gray-900">Vincular a concurso CPH</h2>
              <button onClick={cerrarModalConcurso} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Buscá el concurso al que pertenece esta designación. El cargo tomará el código del
              concurso — no se generará uno nuevo.
            </p>
            <input
              autoFocus
              type="search"
              placeholder="Buscar por puesto, hospital, código de cargo..."
              value={concursoSearch}
              onChange={(e) => setConcursoSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-200">
              {concursoLoading && <p className="p-4 text-sm text-gray-400 text-center">Buscando...</p>}
              {!concursoLoading && concursoResultados.length === 0 && (
                <p className="p-4 text-sm text-gray-400 text-center">
                  {concursoSearch ? 'Sin resultados para esa búsqueda.' : 'Cargando concursos del hospital...'}
                </p>
              )}
              {!concursoLoading &&
                concursoResultados.map((c) => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      const diffId = modalConcurso.diffId
                      cerrarModalConcurso()
                      await ejecutar(
                        diffId,
                        () => vincularConcurso.mutateAsync({ diffId, concursoCphId: c.id }),
                        'Cargo vinculado al concurso.',
                      )
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {c.codigoCargo ?? <span className="text-gray-400 font-normal">Sin código</span>}{' '}
                          <span className="font-normal text-gray-600">{c.literalPuesto}</span>
                        </p>
                        {c.especialidad && (
                          <p className="text-xs text-indigo-600 font-medium mt-0.5 truncate">{c.especialidad}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.hospital}
                          {c.eeConcurso && <> · {c.eeConcurso}</>}
                          {c.expediente && <> · Exp: {c.expediente}</>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            c.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {c.estado}
                        </span>
                        {!c.estaCompleto && (
                          <span className="text-[10px] text-orange-600 font-medium">⚠ Pendiente de completar</span>
                        )}
                        {c.yaDesignado && <span className="text-[10px] text-blue-600 font-medium">Ya tiene designado</span>}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
            <div className="flex justify-end pt-1">
              <button className="btn-outline" onClick={cerrarModalConcurso}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: crear concurso */}
      {modalCrear && (
        <CrearConcursoModal
          item={modalCrear}
          onClose={() => setModalCrear(null)}
          onSubmit={async (body) => {
            const diffId = modalCrear.diffId
            setModalCrear(null)
            await ejecutar(
              diffId,
              () => crearConcurso.mutateAsync({ diffId, body }),
              'Concurso creado.',
            )
          }}
        />
      )}
    </>
  )
}

// ─── Modal de creación de concurso ──────────────────────────────────────────
// cargoId/hospitalId los resuelve el backend desde el diff; acá solo se piden
// los campos que el usuario debe aportar (origen, fecha de vacante, tipo y
// datos opcionales).
function CrearConcursoModal({
  item,
  onClose,
  onSubmit,
}: {
  item: PendienteItem
  onClose: () => void
  onSubmit: (body: CrearConcursoBody) => void
}) {
  const [origen, setOrigen] = useState('')
  const [fechaVacante, setFechaVacante] = useState('')
  const [tipoConcurso, setTipoConcurso] = useState('cph')
  const [motivo, setMotivo] = useState('')
  const [expediente, setExpediente] = useState('')
  const [especialidadSolicitada, setEspecialidadSolicitada] = useState(item.valorNuevo.especialidad ?? '')

  const valido = origen.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fechaVacante)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-primary text-lg font-bold text-gray-900">Crear concurso</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Se creará el cargo del id_sial <span className="font-mono">{item.valorNuevo.idSial ?? item.idSialRol}</span> y
          un concurso asociado. El hospital y el cargo se toman del padrón.
        </p>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700 font-medium">Origen *</span>
            <input
              type="text"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 font-medium">Fecha de vacante *</span>
            <input
              type="date"
              value={fechaVacante}
              onChange={(e) => setFechaVacante(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 font-medium">Tipo de concurso *</span>
            <select
              value={tipoConcurso}
              onChange={(e) => setTipoConcurso(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {TIPO_CONCURSO_OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 font-medium">Especialidad solicitada</span>
            <input
              type="text"
              value={especialidadSolicitada}
              onChange={(e) => setEspecialidadSolicitada(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 font-medium">Motivo</span>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700 font-medium">Expediente</span>
            <input
              type="text"
              value={expediente}
              onChange={(e) => setExpediente(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!valido}
            onClick={() =>
              onSubmit({
                origen: origen.trim(),
                fechaVacante,
                tipoConcurso,
                motivo: motivo.trim() || undefined,
                expediente: expediente.trim() || undefined,
                especialidadSolicitada: especialidadSolicitada.trim() || undefined,
              })
            }
          >
            Crear concurso
          </button>
        </div>
      </div>
    </div>
  )
}
