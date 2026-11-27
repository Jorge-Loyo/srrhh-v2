import { useState, type ReactNode } from 'react'
import {
  useDimIncidenciaContexto,
  LABEL_TIPO_INCIDENCIA,
  LABEL_TIPO_CONCURSO,
  type DimIncidencia,
  type DimIncidenciaContexto,
} from '../hooks/useDimIncidencias'

function fmt(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Campo({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5 break-words">{value ?? <span className="text-gray-300">—</span>}</p>
    </div>
  )
}

function Mono({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-gray-300">—</span>
  return <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{v}</span>
}

type TabKey = 'puesto' | 'persona' | 'actividad' | 'cargo' | 'arbol' | 'sesion'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'puesto',    label: 'Puesto' },
  { key: 'persona',   label: 'Persona' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'cargo',     label: 'Cargo' },
  { key: 'arbol',     label: 'Árbol / POU' },
  { key: 'sesion',    label: 'Sesión' },
]

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function TabPuesto({ ctx }: { ctx: DimIncidenciaContexto }) {
  const p = ctx.puesto
  if (!p) return <p className="text-sm text-gray-400">Sin datos de puesto.</p>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Campo label="id_sial_rol"        value={<Mono v={p.idSialRol} />} />
        <Campo label="Situación revista"  value={p.situacionRevista} />
        <Campo label="Puesto desde"       value={fmt(p.puestoDesde)} />
        <Campo label="Puesto hasta"       value={p.puestoHasta
          ? <span className="text-red-600 font-medium">{fmt(p.puestoHasta)}</span>
          : <span className="text-green-600">Activo</span>} />
        <Campo label="Literal puesto"     value={p.literalPuesto} />
        <Campo label="Especialidad"       value={p.especialidad} />
        <Campo label="Carrera (CR)"       value={p.codigoRegistro} />
        <Campo label="JCAT"               value={p.jcat} />
        <Campo label="Cod. rep."          value={<Mono v={p.codRep} />} />
        <Campo label="Desc. rep."         value={p.descRep} />
        <Campo label="Doc. alta"          value={p.docRespaldAlta} />
        <Campo label="Última en padrón"   value={fmt(p.padronExist)} />
      </div>
      {p.puestoHasta && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Datos de baja</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Campo label="Motivo baja"    value={p.motivoBaja} />
            <Campo label="Doc. resp."     value={p.docRespBaja} />
            <Campo label="Fecha baja"     value={fmt(p.puestoHasta)} />
            <Campo label="Última en bajas" value={fmt(p.bajasExist)} />
          </div>
        </div>
      )}
    </div>
  )
}

function TabPersona({ ctx }: { ctx: DimIncidenciaContexto }) {
  const p = ctx.persona
  if (!p) return <p className="text-sm text-gray-400">Sin datos de persona.</p>
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      <div className="col-span-2">
        <Campo label="Apellido y nombre" value={<span className="font-medium">{p.apellidoNombre}</span>} />
      </div>
      <Campo label="CUIL"               value={<Mono v={p.cuil} />} />
      <Campo label="ID SIAL"            value={<Mono v={p.idSial} />} />
      <Campo label="Sexo"               value={p.sexo} />
      <Campo label="Fecha nacimiento"   value={fmt(p.fechaNacimiento)} />
      <Campo label="Especialidad"       value={p.especialidad} />
      <Campo label="Antigüedad desde"   value={fmt(p.antiguedadDesde)} />
      <Campo label="1er cargo en salud" value={fmt(p.saludPrimerCargo)} />
      <Campo label="Estado"             value={p.activo
        ? <span className="text-green-600 font-medium">Activo</span>
        : <span className="text-red-500 font-medium">Inactivo</span>} />
      <Campo label="Teléfono"           value={p.telefono} />
      <Campo label="Mail laboral"       value={p.mailLaboral} />
      <Campo label="Mail personal"      value={p.mailPersonal} />
      <div className="col-span-2">
        <Campo label="Domicilio"        value={p.domicilio} />
      </div>
      <Campo label="Localidad"          value={p.localidad} />
    </div>
  )
}

function TabActividad({ ctx }: { ctx: DimIncidenciaContexto }) {
  const rows = ctx.actividad
  if (!rows.length) return <p className="text-sm text-gray-400">Sin registros de actividad.</p>
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 mb-3">{rows.length} registro{rows.length !== 1 ? 's' : ''} — más reciente primero</p>
      {rows.map((a) => (
        <div key={a.id} className={`rounded-lg border p-3 ${!a.fechaHasta ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs font-semibold ${!a.fechaHasta ? 'text-green-700' : 'text-gray-400'}`}>
              {!a.fechaHasta ? '● Abierta' : '○ Cerrada'}
            </span>
            <span className="text-xs text-gray-400">{a.situacionRevista}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-gray-400">Desde: </span><span className="font-medium">{fmt(a.fechaDesde)}</span></div>
            <div><span className="text-gray-400">Hasta: </span>
              <span className={a.fechaHasta ? 'text-red-600 font-medium' : 'text-gray-300'}>{fmt(a.fechaHasta) ?? '—'}</span>
            </div>
            <div><span className="text-gray-400">Código cargo: </span><span className="font-mono">{a.codigoCargo ?? '—'}</span></div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TabCargo({ ctx, inc }: { ctx: DimIncidenciaContexto; inc: DimIncidencia }) {
  const c = ctx.cargo
  if (!c) return (
    <div className="space-y-2">
      <p className="text-sm text-gray-400">No se encontró cargo en dim_cargos para esta incidencia.</p>
      {inc.codigoCargo && <p className="text-xs text-gray-400">Código buscado: <Mono v={inc.codigoCargo} /></p>}
    </div>
  )
  const esVV = c.estado === 'validacion_vacante'
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 ${esVV ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${esVV ? 'text-amber-600' : 'text-gray-400'}`}>
          Estado del cargo
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Campo label="Código cargo"         value={<Mono v={c.codigoCargo} />} />
          <Campo label="Estado"               value={<span className={`font-medium ${esVV ? 'text-amber-700' : 'text-gray-700'}`}>{c.estado.replace('_', ' ')}</span>} />
          <Campo label="Sub-estado"           value={c.subEstado} />
          <Campo label="Carrera (CR)"         value={c.codigoRegistro} />
          <Campo label="Efector"              value={c.efector} />
          <Campo label="Literal (legacy)"     value={c.literalPuestoLegacy} />
          <Campo label="Especialidad (legacy)" value={c.especialidadLegacy} />
        </div>
      </div>
      {esVV && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Este cargo fue marcado como <strong>validacion_vacante</strong> al procesar la baja.
          Requiere iniciar concurso o descartar para resolverlo.
        </p>
      )}
    </div>
  )
}

function TabArbol({ ctx }: { ctx: DimIncidenciaContexto }) {
  const a = ctx.arbol
  const pou = ctx.pou
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Posición en el árbol</p>
        {!a ? (
          <p className="text-sm text-gray-400">Efector no encontrado en el árbol.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-400 mb-1">Ruta</p>
              <p className="text-sm font-medium text-gray-800">{a.pathNombres?.replace(/\\/g, ' › ')}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo label="Sigla"               value={<Mono v={a.sigla} />} />
              <Campo label="Tipo"                value={a.tipo} />
              <Campo label="Nivel"               value={a.lvl != null ? `Nivel ${a.lvl}` : null} />
              <Campo label="Universo"            value={a.universoTotalizador} />
              <Campo label="Régimen empleo"      value={a.regimenEmpleo} />
            </div>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ocupación POU</p>
        {!pou ? (
          <p className="text-sm text-gray-400">Sin datos POU para este efector/perfil.</p>
        ) : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              <Campo label="Dotación total" value={<span className="text-xl font-bold text-gray-900">{pou.dotacionTotal ?? '—'}</span>} />
              <Campo label="Activos"        value={<span className="text-xl font-bold text-green-700">{pou.activos ?? '—'}</span>} />
              <Campo label="Vacantes"       value={<span className="text-xl font-bold text-amber-600">{pou.vacantes ?? '—'}</span>} />
              <Campo label="Perfil"         value={pou.perfil} />
              <Campo label="Especialidad"   value={pou.especialidad} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TabSesion({ ctx }: { ctx: DimIncidenciaContexto }) {
  const diffs = ctx.diffs
  if (!diffs.length) return <p className="text-sm text-gray-400">Sin cambios registrados para este puesto en la sesión.</p>
  const COLOR: Record<string, string> = {
    nuevo:      'bg-green-100 text-green-700',
    modificado: 'bg-blue-100 text-blue-700',
    eliminado:  'bg-red-100 text-red-700',
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 mb-2">{diffs.length} cambio{diffs.length !== 1 ? 's' : ''} en esta sesión para este puesto</p>
      <div className="rounded border overflow-hidden">
        <table className="min-w-full text-xs divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Tabla', 'Tipo', 'Campo', 'Anterior', 'Nuevo'].map((h) => (
                <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {diffs.map((d) => (
              <tr key={d.id}>
                <td className="px-2 py-1.5 font-mono text-gray-500">{d.tablaAfectada.replace('dim_', '')}</td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${COLOR[d.tipoDiff] ?? 'bg-gray-100 text-gray-600'}`}>
                    {d.tipoDiff}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-600">{d.campo ?? '—'}</td>
                <td className="px-2 py-1.5 text-gray-400 max-w-[110px] truncate" title={d.valorAnterior ?? ''}>{d.valorAnterior ?? '—'}</td>
                <td className="px-2 py-1.5 text-gray-800 max-w-[110px] truncate" title={d.valorNuevo ?? ''}>{d.valorNuevo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function PanelContexto({
  inc,
  onIniciar,
  onDescartar,
  isPendingIniciar,
  isPendingDescartar,
}: {
  inc: DimIncidencia
  onIniciar: () => void
  onDescartar: () => void
  isPendingIniciar: boolean
  isPendingDescartar: boolean
}) {
  const [tab, setTab] = useState<TabKey>('puesto')
  const { data: ctx, isLoading } = useDimIncidenciaContexto(inc.id)
  const esBaja = inc.tipo === 'baja_gestionable'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`px-5 py-3 border-b shrink-0 ${esBaja ? 'bg-red-50' : 'bg-blue-50'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${esBaja ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
            {LABEL_TIPO_INCIDENCIA[inc.tipo]}
          </span>
          {inc.concurso && (
            <span className="inline-flex px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">
              {LABEL_TIPO_CONCURSO[inc.concurso.tipo]} · {inc.concurso.estado.replace('_', ' ')}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-900 leading-snug">{inc.literalPuesto}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          <span className="font-mono font-medium">{inc.efector}</span>
          {inc.efectorRel.nombre && <span> — {inc.efectorRel.nombre}</span>}
          <span className="ml-2 text-gray-400">CR {inc.codigoRegistro}</span>
          {inc.especialidad && <span className="ml-1 text-gray-400">· {inc.especialidad}</span>}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0 bg-white overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : !ctx ? (
          <p className="text-sm text-gray-400">Sin datos.</p>
        ) : (
          <>
            {tab === 'puesto'    && <TabPuesto    ctx={ctx} />}
            {tab === 'persona'   && <TabPersona   ctx={ctx} />}
            {tab === 'actividad' && <TabActividad ctx={ctx} />}
            {tab === 'cargo'     && <TabCargo     ctx={ctx} inc={inc} />}
            {tab === 'arbol'     && <TabArbol     ctx={ctx} />}
            {tab === 'sesion'    && <TabSesion    ctx={ctx} />}
          </>
        )}
      </div>

      {/* Acciones */}
      {inc.estado === 'pendiente' && (
        <div className="px-5 py-3 border-t bg-white flex gap-3 shrink-0">
          <button
            onClick={onIniciar}
            disabled={isPendingIniciar}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPendingIniciar ? 'Creando...' : 'Iniciar concurso'}
          </button>
          <button
            onClick={onDescartar}
            disabled={isPendingDescartar}
            className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {isPendingDescartar ? 'Descartando...' : 'Descartar'}
          </button>
        </div>
      )}
      {inc.estado === 'descartada' && (
        <div className="px-5 py-3 border-t bg-gray-50 shrink-0">
          <p className="text-xs text-gray-500">
            <span className="font-medium">Motivo: </span>{inc.resolucion ?? 'Sin motivo registrado'}
          </p>
        </div>
      )}
    </div>
  )
}
