import { useEffect, useState } from 'react'
import {
  ETAPAS_CPH,
  TRANSICIONES_CPH,
  ACTORES_CPH,
  DOCS_CPH,
} from './concursoFlowData'
import type { Color } from './concursoFlowData'

interface Props { onClose: () => void }

type Tab = 'flujo' | 'etapas' | 'actores' | 'docs'

export function FlujoConcursoModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('flujo')
  const [etapaIdx, setEtapaIdx] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${fullscreen ? '' : 'p-4'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-white flex flex-col ${fullscreen ? 'w-full h-full' : 'rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh]'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="font-primary text-lg font-bold text-gray-900">Flujo del Concurso CPH</h2>
            <p className="text-xs text-gray-500 mt-0.5">Carrera Profesional Hospitalaria — Ley 6.035 — de principio a fin</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullscreen(f => !f)}
              className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-100"
              title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {fullscreen ? '⊡' : '⊞'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-gray-100 flex-shrink-0">
          {([
            { id: 'flujo', label: '📋 Flujo completo' },
            { id: 'etapas', label: '🔢 Etapas A–G' },
            { id: 'actores', label: '👥 Actores' },
            { id: 'docs', label: '📄 Documentación' },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'text-blue-700 border-blue-600'
                  : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── TAB: Flujo completo ── */}
          {tab === 'flujo' && (
            <div className="space-y-6">

              {/* Origen */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                  Cómo nace un concurso CPH
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      <span className="text-xs font-bold text-blue-800">Nuevo cargo (Alta POF/POU)</span>
                    </div>
                    <ol className="space-y-1">
                      {[
                        'El área de RRHH registra el alta de cargo CPH en /cargos/alta',
                        'El director del hospital recibe la notificación en Autorizaciones',
                        'El director aprueba el alta',
                        'El sistema detecta que es un cargo CPH y ofrece iniciar el concurso',
                        'Se crea el concurso con motivoConcurso = nuevo_cargo',
                      ].map((paso, i) => (
                        <li key={i} className="flex gap-2 text-xs text-gray-700">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center bg-blue-100 text-blue-700">{i + 1}</span>
                          {paso}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                      <span className="text-xs font-bold text-orange-800">Alta por baja (cargo vacante)</span>
                    </div>
                    <ol className="space-y-1">
                      {[
                        'La persona deja el cargo (jubilación, renuncia, cese, defunción)',
                        'El padrón semanal detecta la baja → cargo pasa a validacion_vacante',
                        'El operador aprueba la baja desde el panel de notificaciones',
                        'Se registra la baja con genera_concurso = true',
                        'El cargo queda vigente + vacante',
                        'Se crea el concurso con motivoConcurso = alta_por_baja',
                      ].map((paso, i) => (
                        <li key={i} className="flex gap-2 text-xs text-gray-700">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center bg-orange-100 text-orange-700">{i + 1}</span>
                          {paso}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* Diagrama de transiciones */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                  Transiciones del proceso
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-gray-100 rounded">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Desde</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Hacia</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Condición / Evento</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Tipo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {TRANSICIONES_CPH.map((t, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-700">{t.desde}</td>
                          <td className={`px-3 py-2 font-medium ${t.dashed ? 'text-orange-600' : 'text-blue-700'}`}>
                            {t.dashed ? '⇢ ' : '→ '}{t.hacia}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{t.condicion}</td>
                          <td className="px-3 py-2">
                            {t.dashed
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">Alternativo</span>
                              : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">Normal</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Línea de tiempo visual */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                  Línea de tiempo — camino feliz
                </h3>
                <div className="flex items-center gap-0 overflow-x-auto pb-2">
                  {[
                    { label: 'Origen', color: 'gray' as Color },
                    { label: 'A\nValidación', color: 'orange' as Color },
                    { label: 'B\nAutorizado', color: 'blue' as Color },
                    { label: 'C\nInscripción', color: 'yellow' as Color },
                    { label: 'D\nEvaluación', color: 'purple' as Color },
                    { label: 'E\nAdjudicado', color: 'green' as Color },
                    { label: 'F\nPróx. Desig.', color: 'blue' as Color },
                    { label: 'G\nResolución', color: 'green' as Color },
                    { label: 'Cargo\nOcupado', color: 'green' as Color },
                  ].map((step, i, arr) => (
                    <div key={i} className="flex items-center flex-shrink-0">
                      <div className={`flex flex-col items-center px-3 py-2 rounded-lg border text-center min-w-[72px] ${NODE_BG[step.color]} ${NODE_BORDER[step.color]}`}>
                        <span className={`text-[10px] font-bold whitespace-pre-line leading-tight ${TEXT[step.color]}`}>{step.label}</span>
                      </div>
                      {i < arr.length - 1 && (
                        <span className="text-gray-300 text-lg mx-1 flex-shrink-0">→</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  ⚠️ En cualquier etapa puede declararse desierto → rellamado (vuelve a B). El proceso puede tener múltiples rellamados.
                </p>
              </div>

            </div>
          )}

          {/* ── TAB: Etapas A–G ── */}
          {tab === 'etapas' && (
            <div className="flex gap-4 min-h-0">
              {/* Sidebar */}
              <div className="w-44 flex-shrink-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Etapas</p>
                {ETAPAS_CPH.map((e, i) => (
                  <button
                    key={e.id}
                    onClick={() => setEtapaIdx(i)}
                    className={`w-full text-left px-3 py-2 rounded text-xs mb-1 transition-colors ${
                      i === etapaIdx
                        ? `${SIDEBAR_ACTIVE[e.color]} font-semibold`
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>

              {/* Detalle */}
              <div className="flex-1 space-y-4">
                {(() => {
                  const etapa = ETAPAS_CPH[etapaIdx]
                  return (
                    <>
                      <div className={`rounded-lg border p-4 ${NODE_BG[etapa.color]} ${NODE_BORDER[etapa.color]}`}>
                        <p className={`text-sm font-bold ${TEXT[etapa.color]}`}>{etapa.label}</p>
                        <p className="text-xs text-gray-600 mt-1">{etapa.descripcion}</p>
                      </div>

                      {etapa.origen && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Orígenes posibles</p>
                          <div className="space-y-1">
                            {etapa.origen.map((o, i) => (
                              <div key={i} className="flex gap-2 text-xs text-gray-600">
                                <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[etapa.color]}`} />
                                {o}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Campos del sistema</p>
                        <div className="space-y-1.5">
                          {etapa.campos.map((c) => (
                            <div key={c.campo} className="flex gap-2 text-xs">
                              <code className={`font-mono font-semibold flex-shrink-0 ${TEXT[etapa.color]}`}>{c.campo}</code>
                              <span className="text-gray-500">— {c.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Reglas de negocio</p>
                        <ul className="space-y-1">
                          {etapa.reglas.map((r, i) => (
                            <li key={i} className="flex gap-1.5 text-xs text-gray-600">
                              <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 ${DOT[etapa.color]}`} />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}

          {/* ── TAB: Actores ── */}
          {tab === 'actores' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Personas y áreas que intervienen en el proceso de concurso CPH.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ACTORES_CPH.map((actor) => (
                  <div key={actor.nombre} className={`rounded-lg border p-4 ${NODE_BG[actor.color]} ${NODE_BORDER[actor.color]}`}>
                    <div className="flex items-start gap-2 mb-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${DOT[actor.color]}`} />
                      <div>
                        <p className={`text-xs font-bold ${TEXT[actor.color]}`}>{actor.nombre}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{actor.rol}</p>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {actor.acciones.map((a, i) => (
                        <li key={i} className="flex gap-1.5 text-[10px] text-gray-600">
                          <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 ${DOT[actor.color]}`} />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TAB: Documentación ── */}
          {tab === 'docs' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Documentos requeridos en cada etapa del concurso CPH. Los obligatorios deben estar registrados antes de avanzar a la siguiente etapa.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-gray-100 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Documento</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Campo en BD</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Etapa</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Req.</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {DOCS_CPH.map((doc) => (
                      <tr key={doc.campo} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{doc.nombre}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{doc.campo}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                            {doc.etapa}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {doc.obligatorio
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">Obligatorio</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">Opcional</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-gray-500">{doc.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <p className="text-xs font-bold text-yellow-800 mb-1">⚠️ Tres expedientes distintos</p>
                <p className="text-xs text-yellow-700">
                  Un concurso por alta_por_baja genera <strong>tres expedientes electrónicos</strong>: el EE Baja (documenta la salida de la persona), el EE Concurso (el proceso de selección) y el EE Designación (la designación del ganador). Son tres expedientes independientes en el sistema de gestión documental.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const NODE_BG: Record<Color, string> = {
  blue: 'bg-blue-50', yellow: 'bg-yellow-50', green: 'bg-green-50',
  red: 'bg-red-50', gray: 'bg-gray-50', purple: 'bg-purple-50', orange: 'bg-orange-50',
}
const NODE_BORDER: Record<Color, string> = {
  blue: 'border-blue-200', yellow: 'border-yellow-200', green: 'border-green-200',
  red: 'border-red-200', gray: 'border-gray-200', purple: 'border-purple-200', orange: 'border-orange-200',
}
const TEXT: Record<Color, string> = {
  blue: 'text-blue-800', yellow: 'text-yellow-800', green: 'text-green-800',
  red: 'text-red-800', gray: 'text-gray-700', purple: 'text-purple-800', orange: 'text-orange-800',
}
const DOT: Record<Color, string> = {
  blue: 'bg-blue-500', yellow: 'bg-yellow-500', green: 'bg-green-500',
  red: 'bg-red-500', gray: 'bg-gray-400', purple: 'bg-purple-500', orange: 'bg-orange-500',
}
const SIDEBAR_ACTIVE: Record<Color, string> = {
  blue: 'bg-blue-50 text-blue-800', yellow: 'bg-yellow-50 text-yellow-800', green: 'bg-green-50 text-green-800',
  red: 'bg-red-50 text-red-800', gray: 'bg-gray-100 text-gray-800', purple: 'bg-purple-50 text-purple-800',
  orange: 'bg-orange-50 text-orange-800',
}
