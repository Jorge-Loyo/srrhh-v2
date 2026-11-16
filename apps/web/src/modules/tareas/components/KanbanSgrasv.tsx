import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useKanbanSgrasv, useAsignarConcurso, type TarjetaKanban, type KanbanSgrasvColumna } from '../hooks/useTareas'
import { useSupervisores, useAsignarSiglas, useHospitalesActivos, type Supervisor } from '../hooks/useSupervisores'

// ── Badge de días ─────────────────────────────────────────────────────────────
function BadgeDias({ dias, color }: { dias: number; color: 'verde' | 'naranja' | 'rojo' }) {
  const cls = color === 'verde' ? 'bg-green-100 text-green-700'
    : color === 'naranja' ? 'bg-orange-100 text-orange-700'
    : 'bg-red-100 text-red-700'
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{dias}d</span>
}

// ── Tarjeta de concurso ───────────────────────────────────────────────────────
function TarjetaConcurso({ tarjeta, acciones }: { tarjeta: TarjetaKanban; acciones?: React.ReactNode }) {
  const ruta = tarjeta.tipo === 'cph'
    ? `/concursos/cph/${tarjeta.id}/wizard`
    : `/concursos/ceetps/${tarjeta.id}`
  return (
    <div className="rounded border border-gray-200 bg-white p-2.5 space-y-1.5 text-xs shadow-sm">
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tarjeta.tipo === 'cph' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {tarjeta.tipo.toUpperCase()}
        </span>
        <BadgeDias dias={tarjeta.diasSinMovimiento} color={tarjeta.colorBadge} />
      </div>
      <div>
        <p className="font-mono font-semibold text-gray-800">{tarjeta.cargo.codigo ?? '—'}</p>
        <p className="text-gray-500">{tarjeta.hospital.sigla}</p>
      </div>
      {tarjeta.subEstado && <p className="text-gray-400 truncate">{tarjeta.subEstado}</p>}
      <div className="flex items-center justify-between gap-1 pt-0.5">
        <Link to={ruta} className="text-blue-600 hover:underline">Ver →</Link>
        {acciones}
      </div>
    </div>
  )
}

// ── Modal asignar ─────────────────────────────────────────────────────────────
function ModalAsignar({
  tarjeta, columnas, onAsignar, onClose, isPending,
}: {
  tarjeta: TarjetaKanban
  columnas: KanbanSgrasvColumna[]
  onAsignar: (uid: string | null) => void
  onClose: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Asignar concurso</h3>
          <p className="text-xs text-gray-500 mt-0.5">{tarjeta.cargo.codigo ?? '—'} · {tarjeta.hospital.sigla}</p>
        </div>
        <div className="px-5 py-3 space-y-2 max-h-64 overflow-y-auto">
          {columnas.map((col) => (
            <button key={col.usuario.id}
              className="w-full text-left rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              disabled={isPending}
              onClick={() => onAsignar(col.usuario.id)}
            >
              {col.usuario.apellido} {col.usuario.nombre}
              <span className="text-xs text-gray-400 ml-1">
                ({col.usuario.rolSlug.includes('sgrasv') ? 'SGRASV' : 'Supervisor'})
              </span>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button className="btn-outline text-sm" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Panel de siglas ───────────────────────────────────────────────────────────
function PanelSiglas() {
  const { data: supervisores = [], isLoading } = useSupervisores()
  const { data: hospitales = [] } = useHospitalesActivos()
  const asignarSiglas = useAsignarSiglas()
  const [editando, setEditando] = useState<Supervisor | null>(null)
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [busqueda, setBusqueda] = useState('')

  function abrirEditar(sup: Supervisor) {
    setEditando(sup)
    setSeleccionados(sup.siglas.map((s) => s.hospitalId))
    setBusqueda('')
  }

  function toggleHospital(id: string) {
    setSeleccionados((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function guardar() {
    if (!editando) return
    await asignarSiglas.mutateAsync({ id: editando.id, hospitalIds: seleccionados })
    setEditando(null)
  }

  const hospitalesFiltrados = hospitales.filter((h) =>
    busqueda === '' ||
    h.sigla.toLowerCase().includes(busqueda.toLowerCase()) ||
    h.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 text-sm">Asignación de siglas por supervisor</h2>
      </div>
      {isLoading && <p className="text-sm text-gray-400 px-4 py-3">Cargando…</p>}
      {!isLoading && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
              <th className="text-left px-4 py-2">Supervisor</th>
              <th className="text-left px-4 py-2">Siglas asignadas</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {supervisores.map((sup) => (
              <tr key={sup.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-900">{sup.apellido} {sup.nombre}</p>
                  <p className="text-xs text-gray-400">{sup.rolSlug.includes('sgrasv') ? 'SGRASV' : 'Supervisor'}</p>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {sup.siglas.length === 0
                      ? <span className="text-gray-300 text-xs">Sin siglas</span>
                      : sup.siglas.map((s) => (
                          <span key={s.hospitalId} className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700 font-mono">
                            {s.sigla}
                          </span>
                        ))
                    }
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button className="btn-secondary text-xs px-2 py-1" onClick={() => abrirEditar(sup)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditando(null) }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-gray-900">Siglas de {editando.apellido} {editando.nombre}</h3>
              <input className="input w-full mt-2 text-sm" placeholder="Buscar hospital…"
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {hospitalesFiltrados.map((h) => (
                <label key={h.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-gray-50">
                  <input type="checkbox" className="checkbox" checked={seleccionados.includes(h.id)} onChange={() => toggleHospital(h.id)} />
                  <span className="font-mono text-xs text-blue-700 w-12 shrink-0">{h.sigla}</span>
                  <span className="text-sm text-gray-700 truncate">{h.nombre}</span>
                </label>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center shrink-0">
              <span className="text-xs text-gray-400">{seleccionados.length} seleccionadas</span>
              <div className="flex gap-2">
                <button className="btn-outline text-sm" onClick={() => setEditando(null)}>Cancelar</button>
                <button className="btn-primary text-sm" onClick={guardar} disabled={asignarSiglas.isPending}>
                  {asignarSiglas.isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Kanban SGRASV ─────────────────────────────────────────────────────────────
export function KanbanSgrasv() {
  const { data, isLoading, isError } = useKanbanSgrasv()
  const asignar = useAsignarConcurso()
  const [modalTarjeta, setModalTarjeta] = useState<TarjetaKanban | null>(null)

  if (isLoading) return <p className="text-sm text-gray-400">Cargando kanban…</p>
  if (isError)   return <p className="text-sm text-red-500">No se pudo cargar el kanban.</p>
  if (!data)     return null

  function asignarA(tarjeta: TarjetaKanban, usuarioId: string | null) {
    asignar.mutate({
      referenciaId: tarjeta.id,
      referenciaTipo: tarjeta.tipo === 'cph' ? 'concurso_cph' : 'concurso_ceetps',
      usuarioId,
    })
    setModalTarjeta(null)
  }

  return (
    <div className="space-y-4">
      <PanelSiglas />

      <div>
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Kanban de concursos</h2>
        <div className="flex gap-3 overflow-x-auto pb-3">

          {/* Columna sin asignar */}
          <div className="shrink-0 w-56 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-200">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sin asignar</p>
              <p className="text-xs text-gray-400">{data.sinAsignar.length} concursos</p>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
              {data.sinAsignar.map((t) => (
                <TarjetaConcurso key={t.id} tarjeta={t}
                  acciones={
                    <button className="text-blue-600 hover:underline text-[10px]" onClick={() => setModalTarjeta(t)}>
                      Asignar →
                    </button>
                  }
                />
              ))}
              {data.sinAsignar.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Vacío</p>}
            </div>
          </div>

          {/* Columnas por supervisor */}
          {data.columnas.map((col) => (
            <div key={col.usuario.id} className="shrink-0 w-56 rounded-lg border border-gray-200 bg-white flex flex-col">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-800 truncate">{col.usuario.apellido} {col.usuario.nombre}</p>
                <p className="text-[10px] text-gray-400">
                  {col.usuario.rolSlug.includes('sgrasv') ? 'SGRASV' : 'Supervisor'} · {col.concursos.length}
                </p>
                {col.siglas.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {col.siglas.map((s) => (
                      <span key={s.id} className="font-mono text-[9px] bg-blue-50 text-blue-600 rounded px-1">{s.sigla}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
                {col.concursos.map((t) => (
                  <TarjetaConcurso key={t.id} tarjeta={t}
                    acciones={
                      <div className="flex gap-1">
                        <button className="text-orange-500 hover:underline text-[10px]" onClick={() => setModalTarjeta(t)}>
                          Reasignar
                        </button>
                        <button className="text-gray-400 hover:underline text-[10px]"
                          onClick={() => asignarA(t, null)} disabled={asignar.isPending}>
                          Liberar
                        </button>
                      </div>
                    }
                  />
                ))}
                {col.concursos.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Vacío</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modalTarjeta && (
        <ModalAsignar
          tarjeta={modalTarjeta}
          columnas={data.columnas}
          onAsignar={(uid) => asignarA(modalTarjeta, uid)}
          onClose={() => setModalTarjeta(null)}
          isPending={asignar.isPending}
        />
      )}
    </div>
  )
}
