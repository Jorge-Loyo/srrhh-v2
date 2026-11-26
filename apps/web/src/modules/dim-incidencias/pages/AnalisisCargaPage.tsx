import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { PanelContexto } from '../components/PanelContexto'
import {
  useIniciarConcurso,
  useDescartarIncidencia,
  LABEL_TIPO_INCIDENCIA,
  type DimIncidencia,
} from '../hooks/useDimIncidencias'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Sesion {
  id: string
  tipo: string
  fechaArchivo: string | null
  createdAt: string
  informe: Record<string, unknown>
}

interface Diff {
  id: string
  sesionId: string
  tablaAfectada: string
  tipoDiff: string
  clave: string
  campo: string | null
  valorAnterior: string | null
  valorNuevo: string | null
}

interface PuestoRow {
  idSialRol: string
  literalPuesto: string | null
  especialidad: string | null
  codigoRegistro: string
  hospitalSigla: string | null
  situacionRevista: string | null
  puestoDesde: string | null
  puestoHasta: string | null
  motivoBaja: string | null
}

interface ActividadRow {
  id: number
  idSialRol: string
  cuil: string | null
  situacionRevista: string | null
  fechaDesde: string
  fechaHasta: string | null
  codigoCargo: string | null
}

interface CargoVV {
  codigoCargo: string
  codigoRegistro: string
  efector: string | null
  estado: string
  subEstado: string | null
  literalPuestoLegacy: string | null
  especialidadLegacy: string | null
}

interface AnalisisData {
  sesionActual: Sesion
  sesiones: Sesion[]
  incidencias: DimIncidencia[]
  puestos: {
    modificados: Diff[]
    eliminados: Diff[]
    detalle: PuestoRow[]
    eliminadosDetalle: PuestoRow[]
  }
  actividad: { cerradas: Diff[]; detalle: ActividadRow[] }
  personas: { nuevas: Diff[] }
  cargosVV: CargoVV[]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useAnalisisCarga(sesionId: string | null) {
  return useQuery({
    queryKey: ['analisis-carga', sesionId],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (sesionId) params.sesionId = sesionId
      const res = await apiClient.get<{ data: AnalisisData }>('/api/v1/dim-incidencias/analisis', { params })
      return res.data.data
    },
  })
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>{label}</span>
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${color}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}

// ─── Modales ──────────────────────────────────────────────────────────────────

function ModalConfirmar({ inc, onConfirm, onCancel, isPending }: { inc: DimIncidencia; onConfirm: (obs: string) => void; onCancel: () => void; isPending: boolean }) {
  const [obs, setObs] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold">Iniciar concurso</h2>
        <p className="text-sm text-gray-600">
          <strong>{inc.literalPuesto}</strong> en <strong>{inc.efector}</strong> (CR {inc.codigoRegistro})
        </p>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Observaciones (opcional)" />
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

function ModalDescartar({ inc, onConfirm, onCancel, isPending }: { inc: DimIncidencia; onConfirm: (m: string) => void; onCancel: () => void; isPending: boolean }) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold">Descartar incidencia</h2>
        <p className="text-sm text-gray-600"><strong>{inc.literalPuesto}</strong> en <strong>{inc.efector}</strong></p>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Motivo (opcional)" />
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

// ─── Tab Incidencias ──────────────────────────────────────────────────────────

function TabIncidencias({ data }: { data: AnalisisData }) {
  const [selected, setSelected]     = useState<DimIncidencia | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const iniciar   = useIniciarConcurso()
  const descartar = useDescartarIncidencia()

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

  const rows = data.incidencias
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Lista */}
      <div className={`flex flex-col border-r overflow-hidden ${selected ? 'w-80 shrink-0' : 'flex-1'}`}>
        <div className="px-4 py-2 border-b bg-gray-50 text-xs text-gray-500 shrink-0">
          {rows.length} incidencias pendientes acumuladas
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows.map((inc) => (
            <button
              key={inc.id}
              onClick={() => setSelected((p) => p?.id === inc.id ? null : inc)}
              className={`w-full text-left px-3 py-2.5 border-b hover:bg-gray-50 transition-colors ${selected?.id === inc.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
            >
              <div className="flex items-start gap-2">
                <Badge label="BAJA" color="bg-red-50 text-red-700 border border-red-200" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{inc.literalPuesto}</p>
                  <p className="text-xs text-gray-500 truncate">
                    <span className="font-mono font-medium">{inc.efector}</span>
                    {inc.efectorRel.nombre && <span className="text-gray-400"> · {inc.efectorRel.nombre}</span>}
                  </p>
                  <p className="text-xs text-gray-400">CR {inc.codigoRegistro}{inc.especialidad && ` · ${inc.especialidad}`}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* Detalle */}
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
        <div className="flex-1 flex items-center justify-center text-gray-300 text-sm select-none">
          Seleccioná una incidencia para ver el detalle
        </div>
      )}
      {confirmando && selected && <ModalConfirmar inc={selected} onConfirm={handleIniciar} onCancel={() => setConfirmando(false)} isPending={iniciar.isPending} />}
      {descartando && selected && <ModalDescartar inc={selected} onConfirm={handleDescartar} onCancel={() => setDescartando(false)} isPending={descartar.isPending} />}
    </div>
  )
}

// ─── Tab Puestos ──────────────────────────────────────────────────────────────

function TabPuestos({ data }: { data: AnalisisData }) {
  const [subtab, setSubtab] = useState<'modificados' | 'eliminados'>('modificados')

  // Agrupar diffs modificados por clave (id_sial_rol)
  const porClave = data.puestos.modificados.reduce<Record<string, Diff[]>>((acc, d) => {
    if (!acc[d.clave]) acc[d.clave] = []
    acc[d.clave].push(d)
    return acc
  }, {})
  const detalleMap = Object.fromEntries(data.puestos.detalle.map((p) => [p.idSialRol, p]))
  const elimDetalleMap = Object.fromEntries(data.puestos.eliminadosDetalle.map((p) => [p.idSialRol, p]))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex gap-1 px-4 pt-3 border-b shrink-0">
        {(['modificados', 'eliminados'] as const).map((s) => (
          <button key={s} onClick={() => setSubtab(s)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${subtab === s ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {s === 'modificados' ? `Modificados (${Object.keys(porClave).length})` : `Eliminados del padrón (${data.puestos.eliminados.length})`}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {subtab === 'modificados' && (
          <div className="space-y-3">
            {Object.entries(porClave).map(([clave, diffs]) => {
              const p = detalleMap[clave]
              return (
                <div key={clave} className="rounded-lg border border-blue-200 bg-white p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{clave}</span>
                    {p && <span className="text-sm font-medium text-gray-800">{p.literalPuesto}</span>}
                    {p && <span className="text-xs text-gray-400">{p.hospitalSigla} · CR {p.codigoRegistro}</span>}
                  </div>
                  <div className="space-y-1">
                    {diffs.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400 w-24 shrink-0">{d.campo}</span>
                        <span className="text-red-500 line-through truncate max-w-[140px]" title={d.valorAnterior ?? ''}>{d.valorAnterior ?? '—'}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-700 font-medium truncate max-w-[140px]" title={d.valorNuevo ?? ''}>{d.valorNuevo ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {subtab === 'eliminados' && (
          <div className="rounded border overflow-hidden">
            <table className="min-w-full text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>{['id_sial_rol', 'Puesto', 'Efector', 'CR', 'Situación', 'Puesto hasta'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.puestos.eliminados.map((d) => {
                  const p = elimDetalleMap[d.clave]
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{d.clave}</td>
                      <td className="px-3 py-2 text-gray-800">{p?.literalPuesto ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p?.hospitalSigla ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">{p?.codigoRegistro ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{p?.situacionRevista ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-red-600">{fmt(p?.puestoHasta)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab Actividad ────────────────────────────────────────────────────────────

function TabActividad({ data }: { data: AnalisisData }) {
  const detalleMap = Object.fromEntries(data.actividad.detalle.map((a) => [a.idSialRol, a]))
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-xs text-gray-400 mb-3">{data.actividad.cerradas.length} actividades cerradas en esta carga</p>
      {!data.actividad.cerradas.length ? (
        <p className="text-sm text-gray-400">Sin cierres de actividad en esta sesión.</p>
      ) : (
        <div className="rounded border overflow-hidden">
          <table className="min-w-full text-sm divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['id_sial_rol', 'Puesto', 'Situación', 'Fecha desde', 'Fecha hasta (cierre)', 'Código cargo'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.actividad.cerradas.map((d) => {
                const a = detalleMap[d.clave]
                return (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{d.clave}</td>
                    <td className="px-3 py-2 text-gray-800 text-xs">{a ? '—' : '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{a?.situacionRevista ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{fmt(a?.fechaDesde)}</td>
                    <td className="px-3 py-2 text-xs text-red-600 font-medium">{d.valorNuevo ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{a?.codigoCargo ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab Personas ─────────────────────────────────────────────────────────────

function TabPersonas({ data }: { data: AnalisisData }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-xs text-gray-400 mb-3">{data.personas.nuevas.length} personas nuevas en esta carga</p>
      {!data.personas.nuevas.length ? (
        <p className="text-sm text-gray-400">Sin personas nuevas en esta sesión.</p>
      ) : (
        <div className="rounded border overflow-hidden">
          <table className="min-w-full text-sm divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>{['CUIL', 'Campo', 'Valor'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.personas.nuevas.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{d.clave}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{d.campo ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-800">{d.valorNuevo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab Cargos VV ────────────────────────────────────────────────────────────

function TabCargosVV({ data }: { data: AnalisisData }) {
  const rows = data.cargosVV
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-xs text-gray-400 mb-3">{rows.length} cargos en validación_vacante acumulados</p>
      <div className="rounded border overflow-hidden">
        <table className="min-w-full text-sm divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>{['Código cargo', 'Efector', 'CR', 'Puesto', 'Especialidad', 'Sub-estado'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((c) => (
              <tr key={c.codigoCargo} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{c.codigoCargo}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.efector ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{c.codigoRegistro}</td>
                <td className="px-3 py-2 text-xs text-gray-800 max-w-[180px] truncate" title={c.literalPuestoLegacy ?? ''}>{c.literalPuestoLegacy ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[140px] truncate" title={c.especialidadLegacy ?? ''}>{c.especialidadLegacy ?? '—'}</td>
                <td className="px-3 py-2 text-xs">
                  <span className="inline-flex px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">{c.subEstado ?? 'Vacante'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type MainTab = 'incidencias' | 'puestos' | 'actividad' | 'personas' | 'cargos_vv'

export function AnalisisCargaPage() {
  const [sesionId, setSesionId] = useState<string | null>(null)
  const [tab, setTab]           = useState<MainTab>('incidencias')
  const { data, isLoading, error } = useAnalisisCarga(sesionId)

  // Una vez que carga, si no hay sesionId seleccionado usamos la actual
  const sesionActual = data?.sesionActual

  const TABS: { key: MainTab; label: string; count?: number; color?: string }[] = [
    { key: 'incidencias', label: 'Incidencias',       count: data?.incidencias.length,                                    color: 'text-yellow-700' },
    { key: 'puestos',     label: 'Puestos',            count: (data?.puestos.modificados.length ?? 0) + (data?.puestos.eliminados.length ?? 0) },
    { key: 'actividad',   label: 'Actividad',          count: data?.actividad.cerradas.length },
    { key: 'personas',    label: 'Personas nuevas',    count: data?.personas.nuevas.length },
    { key: 'cargos_vv',   label: 'Cargos vacantes',    count: data?.cargosVV.length,                                       color: 'text-amber-700' },
  ]

  return (
    <div className="flex flex-col -m-6" style={{ height: 'calc(100vh - 64px)' }}>

      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b bg-white shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Análisis de carga semanal</h1>
          {/* Selector de sesión */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Sesión:</span>
            <select
              value={sesionId ?? sesionActual?.id ?? ''}
              onChange={(e) => setSesionId(e.target.value || null)}
              className="border rounded px-2.5 py-1.5 text-sm bg-white"
            >
              {data?.sesiones.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmt(s.createdAt)} — {Array.isArray((s.informe as Record<string,unknown>).tipos)
                    ? ((s.informe as Record<string,unknown>).tipos as string[]).join(', ')
                    : s.tipo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* KPIs */}
        {data && (
          <div className="grid grid-cols-5 gap-3 mb-4">
            <KpiCard label="Incidencias pendientes" value={data.incidencias.length}       color="bg-yellow-50 border-yellow-200" />
            <KpiCard label="Puestos modificados"    value={Object.keys(data.puestos.modificados.reduce<Record<string,boolean>>((a,d)=>{a[d.clave]=true;return a},{})).length} color="bg-blue-50 border-blue-200" />
            <KpiCard label="Puestos eliminados"     value={data.puestos.eliminados.length} color="bg-red-50 border-red-200" />
            <KpiCard label="Personas nuevas"        value={data.personas.nuevas.length}    color="bg-green-50 border-green-200" />
            <KpiCard label="Cargos vacantes"        value={data.cargosVV.length}           color="bg-amber-50 border-amber-200" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`ml-1.5 text-xs font-semibold ${tab === t.key && t.color ? t.color : 'text-gray-400'}`}>({t.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex flex-1 overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
        {error   && <p className="p-6 text-sm text-red-500">Error al cargar los datos.</p>}
        {data && (
          <>
            {tab === 'incidencias' && <TabIncidencias data={data} />}
            {tab === 'puestos'     && <TabPuestos     data={data} />}
            {tab === 'actividad'   && <TabActividad   data={data} />}
            {tab === 'personas'    && <TabPersonas    data={data} />}
            {tab === 'cargos_vv'   && <TabCargosVV    data={data} />}
          </>
        )}
      </div>
    </div>
  )
}
