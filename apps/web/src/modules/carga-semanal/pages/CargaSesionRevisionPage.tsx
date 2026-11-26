import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircleIcon, XCircleIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { getApiErrorMessage } from '@/shared/lib/utils'
import {
  useCargaSesion,
  useCargaDiffs,
  useConfirmarCarga,
  useDescartarCarga,
  LABEL_TIPO,
  ICONO_TIPO,
  COLOR_ESTADO,
  TABLAS_POR_TIPO,
  detectarTipoPorFilename,
  type TipoCarga,
  type CargaDiff,
} from '../hooks/useCargaSemanal'

const ORDEN_PROCESAMIENTO: TipoCarga[] = ['bajas_salud', 'cargos_salud', 'ocupacion_pou', 'arbol']

const LABEL_DIFF: Record<string, string> = {
  nuevo:      '🟢 Nuevo',
  modificado: '🟡 Modificado',
  eliminado:  '🔴 Eliminado',
}

// Normaliza el informe de un tipo: lee la sub-clave [tipo] si existe, si no usa la raíz
function resolverInformeTipo(
  informeCompleto: Record<string, unknown> | null,
  tipo: TipoCarga,
): Record<string, unknown> | null {
  if (!informeCompleto) return null
  const sub = informeCompleto[tipo]
  if (sub && typeof sub === 'object') return sub as Record<string, unknown>
  return informeCompleto
}

function extraerResumen(informe: Record<string, unknown> | null, tipo: TipoCarga) {
  if (!informe) return null
  if (tipo === 'cargos_salud' || tipo === 'bajas_salud') {
    const p   = (informe.dimPuestos         as any) ?? {}
    const per = (informe.dimPersonas        as any) ?? {}
    const act = (informe.dimActividadHechos as any) ?? {}
    return {
      puestosNuevos:      Number(p.nuevos      ?? 0),
      puestosModificados: Number(p.modificados  ?? 0),
      puestosEliminados:  Number(p.eliminados   ?? 0),
      personasNuevas:     Number(per.nuevas     ?? per.nuevos ?? 0),
      actividadesAbrir:   Number(act.aAbrir     ?? act.abiertos ?? 0),
      actividadesCerrar:  Number(act.aCerrar    ?? act.cerrados ?? 0),
      gestionables:       (informe.gestionables as any) ?? null,
      advertencias:       Array.isArray(informe.advertencias) ? informe.advertencias : [],
    }
  }
  if (tipo === 'arbol') {
    return {
      nuevos:      Number((informe.nuevos      as any) ?? 0),
      modificados: Number((informe.modificados as any) ?? 0),
      eliminados:  Number((informe.eliminados  as any) ?? 0),
    }
  }
  if (tipo === 'ocupacion_pou') {
    return {
      nuevos:        Number((informe.nuevos        as any) ?? 0),
      modificados:   Number((informe.modificados   as any) ?? 0),
      eliminados:    Number((informe.eliminados    as any) ?? 0),
      vinculaciones: Number((informe.vinculaciones as any) ?? 0),
    }
  }
  return null
}

function TabResumen({
  tipo,
  informe,
  diffs,
  modResol,
  delResol,
  onModResol,
  onDelResol,
}: {
  tipo: TipoCarga
  informe: Record<string, unknown> | null
  diffs: CargaDiff[]
  modResol: Record<string, 'nuevo' | 'actual'>
  delResol: Record<string, 'eliminar' | 'mantener'>
  onModResol: (k: string, v: 'nuevo' | 'actual') => void
  onDelResol: (k: string, v: 'eliminar' | 'mantener') => void
}) {
  const res = extraerResumen(informe, tipo)
  const tablasDelTipo = TABLAS_POR_TIPO[tipo] ?? []
  const diffsDelTipo  = diffs.filter((d) => tablasDelTipo.includes(d.tablaAfectada))

  const puestosNuevos     = diffsDelTipo.filter((d) => d.tablaAfectada === 'dim_puestos'          && d.tipoDiff === 'nuevo')
  const puestosEliminados = diffsDelTipo.filter((d) => d.tablaAfectada === 'dim_puestos'          && d.tipoDiff === 'eliminado')
  const actividadesAbrir  = diffsDelTipo.filter((d) => d.tablaAfectada === 'dim_actividad_hechos' && d.tipoDiff === 'nuevo')
  const actividadesCerrar = diffsDelTipo.filter((d) => d.tablaAfectada === 'dim_actividad_hechos' && d.tipoDiff === 'eliminado')

  const modPorClave = new Map<string, CargaDiff[]>()
  diffsDelTipo
    .filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'modificado')
    .forEach((d) => {
      if (!modPorClave.has(d.clave)) modPorClave.set(d.clave, [])
      modPorClave.get(d.clave)!.push(d)
    })

  let cards: { label: string; valor: number; color: string }[] = []
  if ((tipo === 'cargos_salud' || tipo === 'bajas_salud') && res) {
    const r = res as any
    cards = [
      { label: 'Puestos nuevos',       valor: r.puestosNuevos,      color: 'text-green-700 bg-green-50' },
      { label: 'Puestos modificados',  valor: r.puestosModificados, color: 'text-yellow-700 bg-yellow-50' },
      { label: 'Puestos eliminados',   valor: r.puestosEliminados,  color: 'text-red-700 bg-red-50' },
      { label: 'Personas nuevas',      valor: r.personasNuevas,     color: 'text-blue-700 bg-blue-50' },
      { label: 'Actividades a abrir',  valor: r.actividadesAbrir,   color: 'text-emerald-700 bg-emerald-50' },
      { label: 'Actividades a cerrar', valor: r.actividadesCerrar,  color: 'text-orange-700 bg-orange-50' },
    ]
  } else if ((tipo === 'arbol' || tipo === 'ocupacion_pou') && res) {
    const r = res as any
    cards = [
      { label: 'Nuevos',      valor: r.nuevos,      color: 'text-green-700 bg-green-50' },
      { label: 'Modificados', valor: r.modificados, color: 'text-yellow-700 bg-yellow-50' },
      { label: 'Eliminados',  valor: r.eliminados,  color: 'text-red-700 bg-red-50' },
    ]
    if (tipo === 'ocupacion_pou' && (res as any).vinculaciones != null) {
      cards.push({ label: 'Vinculaciones POU', valor: (res as any).vinculaciones, color: 'text-purple-700 bg-purple-50' })
    }
  }

  const advertencias = (res as any)?.advertencias ?? []
  const gestionables = (res as any)?.gestionables ?? null

  return (
    <div className="space-y-4">
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map((c) => (
            <div key={c.label} className={`rounded-lg p-3 ${c.color}`}>
              <p className="text-2xl font-bold tabular-nums">{c.valor.toLocaleString('es-AR')}</p>
              <p className="text-xs mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {gestionables && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-1">
          <p className="font-semibold">📋 Gestionables detectados</p>
          {gestionables.puestosNuevos != null && <p>Puestos nuevos gestionables: <strong>{gestionables.puestosNuevos}</strong></p>}
          {gestionables.bajas != null && <p>Bajas gestionables: <strong>{gestionables.bajas}</strong></p>}
        </div>
      )}

      {advertencias.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 space-y-1">
          <p className="font-semibold">⚠️ {advertencias.length} advertencias de calidad de datos</p>
          <ul className="list-disc list-inside space-y-0.5 max-h-40 overflow-y-auto">
            {advertencias.slice(0, 30).map((a: any, i: number) => (
              <li key={i}>{a.idSialRol}: {a.motivos?.join(' · ') ?? a}</li>
            ))}
            {advertencias.length > 30 && (
              <li className="text-yellow-600">...y {advertencias.length - 30} más</li>
            )}
          </ul>
        </div>
      )}

      {puestosNuevos.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🟢 Puestos nuevos — {puestosNuevos.length}</h3>
          <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded text-xs">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr><th className="px-3 py-1.5 text-left font-medium text-gray-600">id_sial_rol</th></tr>
              </thead>
              <tbody>
                {puestosNuevos.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{d.clave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modPorClave.size > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🟡 Puestos modificados — {modPorClave.size}</h3>
          <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded text-xs">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['id_sial_rol','Campo','Anterior','Nuevo','Aplicar'].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...modPorClave.entries()].map(([clave, campos]) =>
                  campos.map((d, i) => (
                    <tr key={d.id} className="border-t border-gray-100">
                      {i === 0 && (
                        <td className="px-3 py-1.5 font-mono text-gray-700 align-top" rowSpan={campos.length}>{clave}</td>
                      )}
                      <td className="px-3 py-1.5 text-gray-500">{d.campo}</td>
                      <td className="px-3 py-1.5 text-gray-400 line-through">{d.valorAnterior ?? '—'}</td>
                      <td className="px-3 py-1.5 text-gray-800">{d.valorNuevo ?? '—'}</td>
                      {i === 0 && (
                        <td className="px-3 py-1.5 align-top" rowSpan={campos.length}>
                          <select
                            className="text-xs border border-gray-200 rounded px-1 py-0.5"
                            value={modResol[clave] ?? 'nuevo'}
                            onChange={(e) => onModResol(clave, e.target.value as 'nuevo' | 'actual')}
                          >
                            <option value="nuevo">Aplicar nuevo</option>
                            <option value="actual">Mantener actual</option>
                          </select>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {puestosEliminados.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🔴 Puestos eliminados — {puestosEliminados.length}</h3>
          <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded text-xs">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['id_sial_rol','Acción'].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {puestosEliminados.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{d.clave}</td>
                    <td className="px-3 py-1.5">
                      <select
                        className="text-xs border border-gray-200 rounded px-1 py-0.5"
                        value={delResol[d.clave] ?? 'eliminar'}
                        onChange={(e) => onDelResol(d.clave, e.target.value as 'eliminar' | 'mantener')}
                      >
                        <option value="eliminar">Cerrar actividad</option>
                        <option value="mantener">Mantener</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {actividadesAbrir.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🟢 Actividades a abrir — {actividadesAbrir.length}</h3>
          <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded text-xs">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">id_sial_rol</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">fecha_desde</th>
                </tr>
              </thead>
              <tbody>
                {actividadesAbrir.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{d.clave}</td>
                    <td className="px-3 py-1.5 text-gray-500">{d.valorNuevo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {actividadesCerrar.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🟠 Actividades a cerrar — {actividadesCerrar.length}</h3>
          <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded text-xs">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">id_sial_rol</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-600">fecha_hasta</th>
                </tr>
              </thead>
              <tbody>
                {actividadesCerrar.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{d.clave}</td>
                    <td className="px-3 py-1.5 text-gray-500">{d.valorNuevo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(tipo === 'arbol' || tipo === 'ocupacion_pou') && diffsDelTipo.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cambios — {diffsDelTipo.length}</h3>
          <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded text-xs">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Clave','Tipo','Campo','Anterior','Nuevo'].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diffsDelTipo.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-gray-700 max-w-[180px] truncate" title={d.clave}>{d.clave}</td>
                    <td className="px-3 py-1.5">{LABEL_DIFF[d.tipoDiff] ?? d.tipoDiff}</td>
                    <td className="px-3 py-1.5 text-gray-500">{d.campo ?? '—'}</td>
                    <td className="px-3 py-1.5 text-gray-400 line-through">{d.valorAnterior ?? '—'}</td>
                    <td className="px-3 py-1.5 text-gray-800">{d.valorNuevo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {cards.every((c) => c.valor === 0) && diffsDelTipo.length === 0 && advertencias.length === 0 && (
        <p className="text-sm text-gray-400">Sin cambios detectados para este archivo.</p>
      )}
    </div>
  )
}

const LABEL_ESTADO_ARCHIVO: Record<string, { icono: string; texto: string; clase: string }> = {
  completado: { icono: '✅', texto: 'Completado',  clase: 'text-green-700 bg-green-50' },
  procesando: { icono: '⏳', texto: 'Procesando…', clase: 'text-yellow-700 bg-yellow-50 animate-pulse' },
  pendiente:  { icono: '⏸',  texto: 'En espera',   clase: 'text-gray-500 bg-gray-50' },
}

function ProgresoArchivos({
  sesion,
  tiposEnSesion,
}: {
  sesion: NonNullable<ReturnType<typeof useCargaSesion>['data']>['data']
  tiposEnSesion: TipoCarga[]
}) {
  const informe = (sesion.informe as Record<string, unknown> | null) ?? {}
  // Primer tipo que aún no tiene resumen en el informe = el que está procesando ahora
  const primerPendiente = tiposEnSesion.find((t) => informe[t] === undefined)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-3">
      <p className="text-sm font-medium text-gray-700">Analizando archivos…</p>
      <ul className="space-y-2">
        {tiposEnSesion.map((tipo) => {
          const archivo = sesion.archivos.find(
            (a) => detectarTipoPorFilename(a.filename) === tipo,
          )
          const estadoArchivo =
            informe[tipo] !== undefined ? 'completado'
            : tipo === primerPendiente    ? 'procesando'
            :                              'pendiente'
          const { icono, texto, clase } = LABEL_ESTADO_ARCHIVO[estadoArchivo]
          return (
            <li key={tipo} className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium w-36 shrink-0 ${clase}`}>
                {icono} {texto}
              </span>
              <span className="text-xs font-medium text-gray-700">{LABEL_TIPO[tipo]}</span>
              {archivo && (
                <span className="text-xs text-gray-400 font-mono truncate">{archivo.filename}</span>
              )}
            </li>
          )
        })}
      </ul>
      {/* Barra de progreso */}
      {(() => {
        const total = tiposEnSesion.length
        const listos = tiposEnSesion.filter((t) => informe[t] !== undefined).length
        const pct = total > 0 ? Math.round((listos / total) * 100) : 0
        return (
          <div className="space-y-1">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{listos} de {total} archivos procesados</p>
          </div>
        )
      })()}
    </div>
  )
}

export function CargaSesionRevisionPage() {
  const { sesionId } = useParams<{ sesionId: string }>()
  const navigate = useNavigate()

  const { data: sesionData } = useCargaSesion(sesionId!)
  const { data: diffsData }  = useCargaDiffs(sesionId!)
  const confirmar = useConfirmarCarga()
  const descartar = useDescartarCarga()

  const sesion = sesionData?.data
  const diffs  = diffsData?.data ?? []

  const [modResol, setModResol] = useState<Record<string, 'nuevo' | 'actual'>>({})
  const [delResol, setDelResol] = useState<Record<string, 'eliminar' | 'mantener'>>({})

  const tiposEnSesion: TipoCarga[] = sesion
    ? ORDEN_PROCESAMIENTO.filter((t) =>
        sesion.archivos.some((a) => detectarTipoPorFilename(a.filename) === t)
      )
    : []

  const [tabActiva, setTabActiva] = useState<TipoCarga | null>(null)
  const tipoVisible = tabActiva ?? tiposEnSesion[0] ?? null

  const informeCompleto = sesion?.informe as Record<string, unknown> | null
  const informeTipo = tipoVisible ? resolverInformeTipo(informeCompleto, tipoVisible) : null

  async function handleConfirmar() {
    await confirmar.mutateAsync({ sesionId: sesionId!, resoluciones: { modificados: modResol, eliminados: delResol } })
    navigate('/carga-semanal')
  }

  async function handleDescartar() {
    await descartar.mutateAsync(sesionId!)
    navigate('/carga-semanal')
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/carga-semanal')}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-primary text-2xl font-bold text-gray-900">Revisión de carga</h1>
          {sesion && (
            <p className="text-xs text-gray-500 mt-0.5">
              {sesion.archivos.map((a) => a.filename).join(' · ')}
            </p>
          )}
        </div>
        {sesion && (
          <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_ESTADO[sesion.estado]}`}>
            {sesion.estado === 'procesando' ? '⏳ analizando...' : '🔵 pendiente confirmación'}
          </span>
        )}
      </div>

      {!sesion && (
        <p className="text-sm text-gray-400">Cargando...</p>
      )}

      {sesion?.estado === 'procesando' && (
        <ProgresoArchivos sesion={sesion} tiposEnSesion={tiposEnSesion} />
      )}

      {sesion?.estado === 'pendiente_confirmacion' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          {/* Tabs */}
          {tiposEnSesion.length > 1 && (
            <div className="flex gap-1 border-b border-gray-200">
              {tiposEnSesion.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTabActiva(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 transition-colors ${
                    tipoVisible === t
                      ? 'border-blue-500 text-blue-700 bg-blue-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {ICONO_TIPO[t]} {LABEL_TIPO[t]}
                </button>
              ))}
            </div>
          )}

          {tipoVisible && (
            <TabResumen
              tipo={tipoVisible}
              informe={informeTipo}
              diffs={diffs}
              modResol={modResol}
              delResol={delResol}
              onModResol={(k, v) => setModResol((p) => ({ ...p, [k]: v }))}
              onDelResol={(k, v) => setDelResol((p) => ({ ...p, [k]: v }))}
            />
          )}

          {(confirmar.isError || descartar.isError) && (
            <p className="text-xs text-red-600 pt-2 border-t border-gray-100">
              {getApiErrorMessage(confirmar.error ?? descartar.error)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
