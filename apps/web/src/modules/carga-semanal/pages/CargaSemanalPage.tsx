import { useRef, useState } from 'react'
import {
  ArrowUpTrayIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { getApiErrorMessage } from '@/shared/lib/utils'
import {
  useSubirCargaSemanal,
  useCargaSesiones,
  useCargaSesion,
  useCargaDiffs,
  useConfirmarCarga,
  useDescartarCarga,
  LABEL_TIPO,
  ICONO_TIPO,
  COLOR_ESTADO,
  type TipoCarga,
  type CargaDiff,
  type ResolucionesConfirmar,
} from '../hooks/useCargaSemanal'

const TIPOS_ACEPTADOS: { tipo: TipoCarga; patron: string; descripcion: string }[] = [
  { tipo: 'cargos_salud',  patron: 'Cargos_salud_YYYYMMDD.xlsx',  descripcion: 'Padrón activo semanal' },
  { tipo: 'bajas_salud',   patron: 'Bajas_salud_YYYYMMDD.xlsx',   descripcion: 'Bajas del período' },
  { tipo: 'arbol',         patron: 'Arbol_Salud_YYYYMMDD.xlsx',   descripcion: 'Árbol organizacional' },
  { tipo: 'ocupacion_pou', patron: 'Ocupacion_POU_MM-YY.xlsx',    descripcion: 'Ocupación POU (hoja Base)' },
  { tipo: 'pou_decreto',   patron: 'POU_DECRETO*HISTORICO.xlsx',  descripcion: 'Dotación normativa del decreto' },
]

const LABEL_DIFF: Record<'nuevo' | 'modificado' | 'eliminado', string> = {
  nuevo:      '🟢 Nuevo',
  modificado: '🟡 Modificado',
  eliminado:  '🔴 Eliminado',
}

// ─── Panel de revisión de diff ────────────────────────────────────────────────

function PanelRevision({
  sesionId,
  onDone,
}: {
  sesionId: string
  onDone: () => void
}) {
  const { data: sesionData, isLoading: loadingSesion } = useCargaSesion(sesionId)
  const { data: diffsData, isLoading: loadingDiffs } = useCargaDiffs(sesionId)
  const confirmar = useConfirmarCarga()
  const descartar = useDescartarCarga()

  const sesion = sesionData?.data
  const diffs = diffsData?.data ?? []

  // Resoluciones por clave
  const [modResol, setModResol] = useState<Record<string, 'nuevo' | 'actual'>>({})
  const [delResol, setDelResol] = useState<Record<string, 'eliminar' | 'mantener'>>({})

  if (loadingSesion || loadingDiffs) {
    return <p className="text-sm text-gray-400 py-4">Cargando análisis de cambios...</p>
  }

  if (!sesion) return null

  // Agrupar diffs por tabla y tipo
  const puestosNuevos    = diffs.filter((d) => d.tablaAfectada === 'dim_puestos'  && d.tipoDiff === 'nuevo')
  const puestosEliminados = diffs.filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'eliminado')
  // Modificados: agrupar por clave (puede haber múltiples campos)
  const modPorClave = new Map<string, CargaDiff[]>()
  diffs
    .filter((d) => d.tablaAfectada === 'dim_puestos' && d.tipoDiff === 'modificado')
    .forEach((d) => {
      if (!modPorClave.has(d.clave)) modPorClave.set(d.clave, [])
      modPorClave.get(d.clave)!.push(d)
    })

  const personasNuevas = diffs.filter((d) => d.tablaAfectada === 'dim_personas' && d.tipoDiff === 'nuevo').length
  const personasMod    = diffs.filter((d) => d.tablaAfectada === 'dim_personas' && d.tipoDiff === 'modificado').length

  const actividadesAAbrir  = diffs.filter((d) => d.tablaAfectada === 'dim_actividad_hechos' && d.tipoDiff === 'nuevo')
  const actividadesACerrar = diffs.filter((d) => d.tablaAfectada === 'dim_actividad_hechos' && d.tipoDiff === 'eliminado')

  const informe = sesion.informe as Record<string, unknown> | null

  async function handleConfirmar() {
    const resoluciones: ResolucionesConfirmar = {
      modificados: modResol,
      eliminados:  delResol,
    }
    await confirmar.mutateAsync({ sesionId, resoluciones })
    onDone()
  }

  async function handleDescartar() {
    await descartar.mutateAsync(sesionId)
    onDone()
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Revisión de cambios — {LABEL_TIPO[sesion.tipo as TipoCarga]}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {sesion.archivos[0]?.filename} · {sesion.archivos[0]?.filas?.toLocaleString('es-AR')} filas
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_ESTADO[sesion.estado]}`}>
          {sesion.estado === 'procesando' ? '⏳ analizando...' : '🔵 pendiente confirmación'}
        </span>
      </div>

      {sesion.estado === 'procesando' && (
        <p className="text-sm text-gray-400 animate-pulse">Calculando diferencias...</p>
      )}

      {sesion.estado === 'pendiente_confirmacion' && (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Puestos nuevos',       valor: puestosNuevos.length,       color: 'text-green-700 bg-green-50' },
              { label: 'Puestos modificados',   valor: modPorClave.size,           color: 'text-yellow-700 bg-yellow-50' },
              { label: 'Puestos eliminados',    valor: puestosEliminados.length,   color: 'text-red-700 bg-red-50' },
              { label: 'Personas nuevas',       valor: personasNuevas,             color: 'text-blue-700 bg-blue-50' },
              { label: 'Actividades a abrir',   valor: actividadesAAbrir.length,   color: 'text-emerald-700 bg-emerald-50' },
              { label: 'Actividades a cerrar',  valor: actividadesACerrar.length,  color: 'text-orange-700 bg-orange-50' },
            ].map((c) => (
              <div key={c.label} className={`rounded-lg p-3 ${c.color}`}>
                <p className="text-2xl font-bold tabular-nums">{c.valor.toLocaleString('es-AR')}</p>
                <p className="text-xs mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Advertencias del informe */}
          {Array.isArray((informe as any)?.advertencias) && (informe as any).advertencias.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 space-y-1">
              <p className="font-semibold">⚠️ {(informe as any).advertencias.length} advertencias de calidad de datos</p>
              <ul className="list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                {(informe as any).advertencias.slice(0, 20).map((a: any, i: number) => (
                  <li key={i}>{a.idSialRol}: {a.motivos.join(' · ')}</li>
                ))}
                {(informe as any).advertencias.length > 20 && (
                  <li className="text-yellow-600">...y {(informe as any).advertencias.length - 20} más</li>
                )}
              </ul>
            </div>
          )}

          {/* Tabla: puestos nuevos */}
          {puestosNuevos.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {LABEL_DIFF.nuevo} — {puestosNuevos.length} puestos
              </h3>
              <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded text-xs">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">id_sial_rol</th>
                    </tr>
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

          {/* Tabla: puestos modificados con resolución */}
          {modPorClave.size > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {LABEL_DIFF.modificado} — {modPorClave.size} puestos
              </h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded text-xs">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['id_sial_rol', 'Campo', 'Valor actual', 'Valor nuevo', 'Aplicar'].map((h) => (
                        <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...modPorClave.entries()].map(([clave, campos]) =>
                      campos.map((d, i) => (
                        <tr key={d.id} className="border-t border-gray-100">
                          {i === 0 && (
                            <td className="px-3 py-1.5 font-mono text-gray-700 align-top" rowSpan={campos.length}>
                              {clave}
                            </td>
                          )}
                          <td className="px-3 py-1.5 text-gray-500">{d.campo}</td>
                          <td className="px-3 py-1.5 text-gray-400 line-through">{d.valorAnterior ?? '—'}</td>
                          <td className="px-3 py-1.5 text-gray-800">{d.valorNuevo ?? '—'}</td>
                          {i === 0 && (
                            <td className="px-3 py-1.5 align-top" rowSpan={campos.length}>
                              <select
                                className="text-xs border border-gray-200 rounded px-1 py-0.5"
                                value={modResol[clave] ?? 'nuevo'}
                                onChange={(e) =>
                                  setModResol((prev) => ({ ...prev, [clave]: e.target.value as 'nuevo' | 'actual' }))
                                }
                              >
                                <option value="nuevo">Aplicar nuevo</option>
                                <option value="actual">Mantener actual</option>
                              </select>
                            </td>
                          )}
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Tabla: puestos eliminados con resolución */}
          {puestosEliminados.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {LABEL_DIFF.eliminado} — {puestosEliminados.length} puestos
              </h3>
              <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded text-xs">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['id_sial_rol', 'Acción'].map((h) => (
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
                            onChange={(e) =>
                              setDelResol((prev) => ({
                                ...prev,
                                [d.clave]: e.target.value as 'eliminar' | 'mantener',
                              }))
                            }
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

          {/* Acciones */}

          {/* Tabla de hechos: actividades a abrir */}
          {actividadesAAbrir.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                🟢 Actividades a abrir en tabla de hechos — {actividadesAAbrir.length}
              </h3>
              <div className="overflow-x-auto max-h-40 overflow-y-auto border rounded text-xs">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">id_sial_rol</th>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">fecha_desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actividadesAAbrir.map((d) => (
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

          {/* Tabla de hechos: actividades a cerrar */}
          {actividadesACerrar.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                🟠 Actividades a cerrar en tabla de hechos — {actividadesACerrar.length}
              </h3>
              <div className="overflow-x-auto max-h-40 overflow-y-auto border rounded text-xs">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">id_sial_rol</th>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">fecha_hasta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actividadesACerrar.map((d) => (
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

          {/* Acciones reales */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              disabled={confirmar.isPending}
              onClick={handleConfirmar}
              className="btn-primary flex items-center gap-2"
            >
              <CheckCircleIcon className="w-4 h-4" />
              {confirmar.isPending ? 'Aplicando...' : 'Confirmar y aplicar'}
            </button>
            <button
              type="button"
              disabled={descartar.isPending || confirmar.isPending}
              onClick={handleDescartar}
              className="btn-secondary flex items-center gap-2"
            >
              <XCircleIcon className="w-4 h-4" />
              Descartar
            </button>
            {(confirmar.isError || descartar.isError) && (
              <p className="text-xs text-red-600">
                {getApiErrorMessage(confirmar.error ?? descartar.error)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function CargaSemanalPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [sesionEnRevision, setSesionEnRevision] = useState<string | null>(null)

  const subir = useSubirCargaSemanal()
  const { data, isLoading } = useCargaSesiones({ limit: 20 } as never)
  const sesiones = data?.data ?? []

  async function handleFiles(files: File[]) {
    setError('')
    setSesionEnRevision(null)
    try {
      const res = await subir.mutateAsync(files)
      setSesionEnRevision(res.sesionId)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-primary text-2xl font-bold text-gray-900">Carga semanal de archivos</h1>
        <p className="text-sm text-gray-500 mt-1">
          El tipo se detecta automáticamente por el nombre del archivo. El procesamiento es asíncrono —
          el estado se actualiza en tiempo real.
        </p>
      </div>

      {/* Tipos aceptados */}
      <div className="bg-white rounded-lg shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Archivos aceptados</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TIPOS_ACEPTADOS.map((t) => (
            <div key={t.tipo} className="flex items-start gap-2 text-xs text-gray-600">
              <span className="text-base leading-none mt-0.5">{ICONO_TIPO[t.tipo]}</span>
              <div>
                <span className="font-mono text-gray-800">{t.patron}</span>
                <span className="text-gray-400 ml-1">— {t.descripcion}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dropzone */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center hover:border-primary-300 hover:bg-primary-50/30 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const files = Array.from(e.dataTransfer.files).filter((f) => /\.xlsx?$/i.test(f.name))
            if (files.length) handleFiles(files)
          }}
        >
          <DocumentArrowUpIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600">
            {subir.isPending
              ? 'Subiendo...'
              : 'Arrastrá uno o varios Excel acá, o hacé click para elegirlos'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Podés subir Cargos + Bajas + Árbol + POU juntos</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) handleFiles(files)
              e.target.value = ''
            }}
          />
        </div>

        <button
          type="button"
          disabled={subir.isPending}
          onClick={() => inputRef.current?.click()}
          className="btn-primary flex items-center gap-2"
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          {subir.isPending ? 'Subiendo...' : 'Elegir archivo'}
        </button>

        {error && (
          <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Panel de revisión (aparece cuando hay sesión en análisis o pendiente) */}
      {sesionEnRevision && (
        <PanelRevision
          sesionId={sesionEnRevision}
          onDone={() => setSesionEnRevision(null)}
        />
      )}

      {/* Historial */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">
          Historial de cargas
          {sesiones.some((s) => s.estado === 'procesando') && (
            <span className="ml-2 inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
        </h2>

        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : sesiones.length === 0 ? (
          <p className="text-sm text-gray-400">Todavía no hay cargas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Tipo', 'Archivo', 'Filas', 'Estado', 'Usuario', 'Fecha', ''].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sesiones.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      <span className="mr-1">{ICONO_TIPO[s.tipo]}</span>
                      {LABEL_TIPO[s.tipo]}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 max-w-[180px] truncate">
                      {s.archivos[0]?.filename ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">
                      {s.archivos[0]?.filas != null
                        ? s.archivos[0].filas.toLocaleString('es-AR')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_ESTADO[s.estado]}`}>
                        {s.estado === 'procesando'             ? '⏳ procesando'
                        : s.estado === 'pendiente_confirmacion' ? '🔵 pendiente'
                        : s.estado === 'completado'             ? '✅ completado'
                        :                                         '❌ error'}
                      </span>
                      {s.estado === 'error' && s.errorMsg && (
                        <p className="text-red-600 text-xs mt-0.5 max-w-[200px] truncate" title={s.errorMsg}>
                          {s.errorMsg}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{s.username ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.estado === 'pendiente_confirmacion' && s.id !== sesionEnRevision && (
                        <button
                          type="button"
                          className="text-blue-600 hover:underline text-xs"
                          onClick={() => setSesionEnRevision(s.id)}
                        >
                          Revisar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
