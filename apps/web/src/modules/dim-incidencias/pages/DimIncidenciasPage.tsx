import { useState } from 'react'
import {
  useDimIncidencias,
  useIniciarConcurso,
  useDescartarIncidencia,
  LABEL_TIPO_INCIDENCIA,
  type DimIncidencia,
  type TipoIncidencia,
  type EstadoIncidencia,
} from '../hooks/useDimIncidencias'
import { useDimEfectores, useDimCarreras } from '../../dotacion/hooks/useDimDotacion'
import { PanelContexto } from '../components/PanelContexto'

const PAGE_SIZE = 100

function KpiCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${color}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function FilaIncidencia({ inc, selected, onClick }: { inc: DimIncidencia; selected: boolean; onClick: () => void }) {
  const esBaja = inc.tipo === 'baja_gestionable'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${esBaja ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
          {esBaja ? 'BAJA' : 'NUEVO'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{inc.literalPuesto}</p>
          <p className="text-xs text-gray-500 truncate">
            <span className="font-mono font-medium">{inc.efector}</span>
            {inc.efectorRel.nombre && <span className="text-gray-400"> · {inc.efectorRel.nombre}</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            CR {inc.codigoRegistro}{inc.especialidad && <span> · {inc.especialidad}</span>}
          </p>
        </div>
      </div>
    </button>
  )
}

function ModalConfirmar({ inc, onConfirm, onCancel, isPending }: { inc: DimIncidencia; onConfirm: (obs: string) => void; onCancel: () => void; isPending: boolean }) {
  const [obs, setObs] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold">Iniciar concurso</h2>
        <p className="text-sm text-gray-600">
          Se creará un concurso para <strong>{inc.literalPuesto}</strong> en <strong>{inc.efector}</strong> (CR {inc.codigoRegistro}).
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones (opcional)</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Notas adicionales..." />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => onConfirm(obs)} disabled={isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {isPending ? 'Creando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalDescartar({ inc, onConfirm, onCancel, isPending }: { inc: DimIncidencia; onConfirm: (motivo: string) => void; onCancel: () => void; isPending: boolean }) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold">Descartar incidencia</h2>
        <p className="text-sm text-gray-600">
          La incidencia de <strong>{inc.literalPuesto}</strong> en <strong>{inc.efector}</strong> quedará descartada.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Motivo (opcional)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="Ej: cargo ya cubierto, error de carga..." />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={() => onConfirm(motivo)} disabled={isPending} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {isPending ? 'Descartando...' : 'Descartar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DimIncidenciasPage() {
  const [tab, setTab]                       = useState<EstadoIncidencia>('pendiente')
  const [tipo, setTipo]                     = useState<TipoIncidencia | ''>('')
  const [efector, setEfector]               = useState('')
  const [codigoRegistro, setCodigoRegistro] = useState('')
  const [page, setPage]                     = useState(1)
  const [selected, setSelected]             = useState<DimIncidencia | null>(null)
  const [confirmando, setConfirmando]       = useState(false)
  const [descartando, setDescartando]       = useState(false)

  const { data: efectores } = useDimEfectores()
  const { data: carreras }  = useDimCarreras()
  const GESTIONABLES = new Set(['22', '23', '37', '83', '85', '87'])
  const carrerasGestionables = carreras?.filter((c) => GESTIONABLES.has(c.codigoRegistro)) ?? []

  const { data: dataPendiente }  = useDimIncidencias({ page: 1, limit: 1, estado: 'pendiente' })
  const { data: dataResuelta }   = useDimIncidencias({ page: 1, limit: 1, estado: 'resuelta' })
  const { data: dataDescartada } = useDimIncidencias({ page: 1, limit: 1, estado: 'descartada' })

  const { data, isLoading } = useDimIncidencias({
    page, limit: PAGE_SIZE,
    estado: tab,
    tipo:           tipo || undefined,
    efector:        efector || undefined,
    codigoRegistro: codigoRegistro || undefined,
  })

  const iniciar   = useIniciarConcurso()
  const descartar = useDescartarIncidencia()

  function handleTabChange(t: EstadoIncidencia) { setTab(t); setPage(1); setSelected(null) }
  function handleSelect(inc: DimIncidencia) { setSelected((prev) => prev?.id === inc.id ? null : inc) }

  function handleIniciar(obs: string) {
    if (!selected) return
    iniciar.mutate({ id: selected.id, observaciones: obs || undefined }, {
      onSuccess: () => { setConfirmando(false); setSelected(null) },
    })
  }

  function handleDescartar(motivo: string) {
    if (!selected) return
    descartar.mutate({ id: selected.id, motivo: motivo || undefined }, {
      onSuccess: () => { setDescartando(false); setSelected(null) },
    })
  }

  const ESTADO_TABS: { key: EstadoIncidencia; label: string; count: number | undefined; color: string }[] = [
    { key: 'pendiente',  label: 'Pendientes',  count: dataPendiente?.total,  color: 'text-yellow-700' },
    { key: 'resuelta',   label: 'Resueltas',   count: dataResuelta?.total,   color: 'text-green-700'  },
    { key: 'descartada', label: 'Descartadas', count: dataDescartada?.total, color: 'text-gray-500'   },
  ]

  const totalBajas  = data?.rows.filter((r) => r.tipo === 'baja_gestionable').length ?? 0
  const totalNuevos = data?.rows.filter((r) => r.tipo === 'puesto_nuevo_gestionable').length ?? 0
  const efectoresSet = new Set(data?.rows.map((r) => r.efector) ?? [])
  const carrerasSet  = new Set(data?.rows.map((r) => r.codigoRegistro) ?? [])

  return (
    <div className="flex flex-col -m-6" style={{ height: 'calc(100vh - 64px)' }}>

      {/* Header + KPIs + tabs */}
      <div className="px-6 pt-5 pb-0 border-b bg-white shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">Incidencias de carga semanal</h1>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <KpiCard label="Pendientes"         value={dataPendiente?.total ?? 0} color="bg-yellow-50 border-yellow-200" />
          <KpiCard label="Bajas gestionables" value={totalBajas}  sub={`de ${data?.total ?? 0} en página`} color="bg-red-50 border-red-200" />
          <KpiCard label="Puestos nuevos"     value={totalNuevos} sub={totalNuevos === 0 ? 'ninguno en esta carga' : 'en página'} color={totalNuevos === 0 ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'} />
          <KpiCard label="Efectores"          value={efectoresSet.size} sub={`${carrerasSet.size} carreras`} color="bg-gray-50 border-gray-200" />
        </div>
        <div className="flex gap-1">
          {ESTADO_TABS.map((t) => (
            <button key={t.key} onClick={() => handleTabChange(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`ml-1.5 text-xs font-semibold ${tab === t.key ? t.color : 'text-gray-400'}`}>({t.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 py-2.5 border-b bg-gray-50 flex flex-wrap gap-2 items-center shrink-0">
        <select value={tipo} onChange={(e) => { setTipo(e.target.value as TipoIncidencia | ''); setPage(1) }} className="border rounded px-2.5 py-1.5 text-sm bg-white">
          <option value="">Todos los tipos</option>
          <option value="baja_gestionable">Baja gestionable</option>
          <option value="puesto_nuevo_gestionable">Puesto nuevo</option>
        </select>
        <select value={efector} onChange={(e) => { setEfector(e.target.value); setPage(1) }} className="border rounded px-2.5 py-1.5 text-sm bg-white">
          <option value="">Todos los efectores</option>
          {(efectores ?? []).map((e) => (
            <option key={e.sigla} value={e.sigla}>{e.sigla}{e.nombre ? ` — ${e.nombre}` : ''}</option>
          ))}
        </select>
        <select value={codigoRegistro} onChange={(e) => { setCodigoRegistro(e.target.value); setPage(1) }} className="border rounded px-2.5 py-1.5 text-sm bg-white">
          <option value="">Todas las carreras</option>
          {carrerasGestionables.map((c) => (
            <option key={c.codigoRegistro} value={c.codigoRegistro}>CR {c.codigoRegistro} — {c.litCodReg}</option>
          ))}
        </select>
        {(tipo || efector || codigoRegistro) && (
          <button onClick={() => { setTipo(''); setEfector(''); setCodigoRegistro(''); setPage(1) }} className="text-xs text-gray-400 hover:text-gray-600 underline">Limpiar</button>
        )}
        {data && <span className="ml-auto text-xs text-gray-400">{data.total} incidencias</span>}
      </div>

      {/* Lista + panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Lista */}
        <div className={`flex flex-col border-r overflow-hidden ${selected ? 'w-80 shrink-0' : 'flex-1'}`}>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-gray-400">Cargando...</p>
            ) : !data?.rows.length ? (
              <p className="p-4 text-sm text-gray-400">Sin incidencias para los filtros seleccionados.</p>
            ) : (
              data.rows.map((inc) => (
                <FilaIncidencia key={inc.id} inc={inc} selected={selected?.id === inc.id} onClick={() => handleSelect(inc)} />
              ))
            )}
          </div>
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t bg-gray-50 text-xs text-gray-500 shrink-0">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-white">←</button>
              <span>{page} / {data.pages}</span>
              <button disabled={page === data.pages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-white">→</button>
            </div>
          )}
        </div>

        {/* Panel detalle */}
        {selected ? (
          <div className="flex-1 overflow-hidden">
            <PanelContexto
              inc={selected}
              onIniciar={() => setConfirmando(true)}
              onDescartar={() => setDescartando(true)}
              isPendingIniciar={iniciar.isPending}
              isPendingDescartar={descartar.isPending}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 select-none">
            {tab === 'pendiente' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 max-w-sm text-center">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Carga actual</p>
                <p className="text-sm text-blue-800">Esta carga semanal no registró puestos nuevos gestionables. Todas las incidencias son <strong>bajas</strong>.</p>
              </div>
            )}
            <p className="text-gray-300 text-sm">Seleccioná una incidencia para ver el detalle</p>
          </div>
        )}
      </div>

      {/* Modales */}
      {confirmando && selected && (
        <ModalConfirmar inc={selected} onConfirm={handleIniciar} onCancel={() => setConfirmando(false)} isPending={iniciar.isPending} />
      )}
      {descartando && selected && (
        <ModalDescartar inc={selected} onConfirm={handleDescartar} onCancel={() => setDescartando(false)} isPending={descartar.isPending} />
      )}
    </div>
  )
}
