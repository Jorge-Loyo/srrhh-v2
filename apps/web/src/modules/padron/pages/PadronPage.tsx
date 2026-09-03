import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EstadoSnapshot } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useSnapshotEstado, useSnapshots, useUploadPadron, useDeleteSnapshot, useExportarSnapshot } from '../hooks/usePadron'

const ESTADO_BADGE: Record<string, string> = {
  procesando: 'badge-warning',
  pendiente: 'badge-warning',
  aprobado: 'badge-success',
  rechazado: 'badge-danger',
  error: 'badge-danger',
}

const ESTADO_LABEL: Record<string, string> = {
  procesando: 'Procesando',
  pendiente: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  error: 'Error',
}

const PASO_LABEL: Record<string, string> = {
  normalizar: 'Normalizando columnas del Excel...',
  procesar: 'Procesando padrón (puede tardar unos minutos)...',
  cruzar: 'Cruzando con la base de datos...',
  diff: 'Calculando diferencias...',
  guardando: 'Guardando resultado...',
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

type PadronColor = 'blue' | 'green' | 'orange' | 'yellow' | 'purple' | 'gray'

const PC_BG: Record<PadronColor, string> = {
  blue: 'bg-blue-50', green: 'bg-green-50', orange: 'bg-orange-50',
  yellow: 'bg-yellow-50', purple: 'bg-purple-50', gray: 'bg-gray-50',
}
const PC_BORDER: Record<PadronColor, string> = {
  blue: 'border-blue-200', green: 'border-green-200', orange: 'border-orange-200',
  yellow: 'border-yellow-200', purple: 'border-purple-200', gray: 'border-gray-200',
}
const PC_TEXT: Record<PadronColor, string> = {
  blue: 'text-blue-800', green: 'text-green-800', orange: 'text-orange-800',
  yellow: 'text-yellow-800', purple: 'text-purple-800', gray: 'text-gray-700',
}
const PC_DOT: Record<PadronColor, string> = {
  blue: 'bg-blue-500', green: 'bg-green-500', orange: 'bg-orange-500',
  yellow: 'bg-yellow-500', purple: 'bg-purple-500', gray: 'bg-gray-400',
}
const PC_BADGE: Record<PadronColor, string> = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  gray: 'bg-gray-50 border-gray-200 text-gray-600',
}

const PIPELINE_STEPS = [
  {
    id: 'upload', label: 'Subida', color: 'blue' as PadronColor,
    titulo: 'Subida del archivo',
    desc: 'El usuario sube un Excel Cargos_salud.xlsx con hoja Sheet1. Cada fila es un cargo del SIAL identificado por ID SIAL (campo CARGO del origen).',
    items: [
      { label: 'Archivo', desc: 'Cargos_salud.xlsx — hoja Sheet1' },
      { label: 'Identificador único', desc: 'ID SIAL (campo CARGO del SIAL, ej: 001448563-3)' },
      { label: 'Fecha asignada', desc: 'Fecha del padrón que se está cargando (YYYY-MM-DD)' },
      { label: 'Límite', desc: '50 MB máximo por archivo' },
    ],
    nota: 'Solo puede haber un snapshot en estado procesando o pendiente a la vez. Si ya existe uno, el sistema bloquea la subida.',
  },
  {
    id: 'normalizar', label: 'Normalizar', color: 'purple' as PadronColor,
    titulo: 'Normalización de columnas',
    desc: 'Dotaneitor limpia y estandariza las columnas del Excel antes de procesar.',
    items: [
      { label: 'SIGLA', desc: 'UAIEAIT → EAIT, quita prefijo DGAH' },
      { label: 'NUM_DOC', desc: 'Se mantiene como string para preservar ceros iniciales' },
      { label: 'CODIGO DE REGISTRO', desc: 'Se mantiene como string (puede tener sufijo B, ej: 17B)' },
      { label: 'LIT_COD_REG', desc: 'COD_REG=22 → fuerza "Nueva Carrera Prof. Hosp"' },
    ],
    nota: null,
  },
  {
    id: 'procesar', label: 'Procesar', color: 'orange' as PadronColor,
    titulo: 'Procesamiento (Dotaneitor)',
    desc: 'Transforma el Excel en un DataFrame normalizado con todas las columnas calculadas.',
    items: [
      { label: 'CUIL Y ROL', desc: 'CUIL limpio + "-" + ROL extraído del campo CARGO' },
      { label: 'UNIFICADOR DE PUESTOS', desc: 'Cruce LIT_COD_REG + LIT_PUESTO → ref_unificadores_puesto (BD)' },
      { label: 'AGRUPADOR', desc: 'Cruce ESCALAFON + LIT_PUESTO → ref_agrupadores (BD). Regla: COD_SIT=32 + "Enfermero/a" → "Enfermero/a ATP"' },
      { label: 'JEFE ESCALAFON', desc: 'COD_REG 37 sin escritorio → Jefe CPH POF | 37 con escritorio → Jefe CPH POU | 85 → Jefe Técnico | 87 → Jefe Enfermería | 83 → Jefe Administrativo' },
      { label: 'ESTADO', desc: 'BLOQ_DESDE → Bloqueado | SIT_REV contiene "retención" → Retención de Cargo | "comisión" → Comisión | default → Activo' },
      { label: 'Deduplicación', desc: 'Duplicados de ID SIAL: se conserva la fila más completa. Jefaturas CPH con rol duplicado activo sin CODIGO JEFATURAS: se eliminan.' },
      { label: 'Mayúsculas', desc: 'ESPECIALIDAD, AGRUPADOR, UNIVERSO TOTALIZADOR, TIPO DE HOSPITAL / SIGLA, MONOVALENCIA, UNIFICADOR DE PUESTOS, JEFE ESCALAFON → MAYÚSCULA SIN TILDE' },
    ],
    nota: null,
  },
  {
    id: 'cruzar', label: 'Cruzar', color: 'yellow' as PadronColor,
    titulo: 'Cruce de ESPECIALIDAD',
    desc: 'Completa la columna ESPECIALIDAD en tres pasadas, de mayor a menor prioridad.',
    items: [
      { label: '1. Fuente SIAL', desc: 'LIT_ESP_CARGO del Excel — solo para COD_REG 37 (CPH), 23 (Suplentes), 24 (Residentes). Los demás se vacían.' },
      { label: '2. Por CUIL', desc: 'Huecos completados buscando CUIL + COD_REG en ref_especialidades_cuil (BD).' },
      { label: '3. Por AGRUPADOR', desc: 'Huecos restantes completados por AGRUPADOR + PUESTO en ref_especialidad_por_puesto (BD).' },
      { label: 'Normalización final', desc: 'Todo el resultado pasa por sin_tilde_mayuscula() → MAYÚSCULA SIN TILDE.' },
    ],
    nota: 'Las tablas de referencia se pueden actualizar en Postgres sin rebuild del contenedor.',
  },
  {
    id: 'diff', label: 'Diff', color: 'blue' as PadronColor,
    titulo: 'Cálculo del diff (Node)',
    desc: 'Node compara el DataFrame de Dotaneitor contra los cargos vigentes en Postgres y clasifica cada ID SIAL.',
    items: [
      { label: 'NUEVO', desc: 'ID SIAL en el padrón pero no en cargos vigentes. Nace con aprobado=null (pendiente decisión individual).' },
      { label: 'ELIMINADO', desc: 'ID SIAL en BD pero ausente del padrón. El cargo pasa a validacion_vacante — no se borra directamente.' },
      { label: 'MODIFICADO', desc: 'ID SIAL en ambos con al menos un campo distinto. Campos: LITERAL PUESTO, ESPECIALIDAD, AGRUPADOR, UNIFICADOR DE PUESTOS, CODIGO REPA, DESCRIPCION REPA, AGRUPAMIENTO, SITUACION DE REVISTA, ESTADO, CODIGO JEFATURAS, JEFE ESCALAFON, COMISION, REPA COMISION, COD SITUACION, CARGO DESDE/HASTA.' },
    ],
    nota: null,
  },
  {
    id: 'aprobar', label: 'Aprobar', color: 'green' as PadronColor,
    titulo: 'Aprobación del snapshot',
    desc: 'El operador revisa los diffs y aprueba o rechaza. Los modificados y eliminados se aplican automáticamente; los nuevos requieren decisión individual.',
    items: [
      { label: 'Nuevos — Aprobar', desc: 'Genera código de cargo (prefijo + secuencial). Crea Persona, Cargo, Ocupación y registro en el histórico.' },
      { label: 'Nuevos — Sin código', desc: 'Crea el cargo sin código asignado. La persona y la ocupación se crean igual.' },
      { label: 'Modificados', desc: 'Se aplican automáticamente al aprobar el snapshot. Actualiza Cargo u Ocupación según el campo.' },
      { label: 'Eliminados', desc: 'Cierra la Ocupación (hasta = fechaPadron). Cargo → validacion_vacante. Persona sin ocupaciones vigentes → activo=false.' },
      { label: 'Reaparición', desc: 'Cargo en validacion_vacante que vuelve a aparecer en el padrón → vuelve a vigente automáticamente.' },
      { label: 'Bloqueo', desc: 'No se puede aprobar el snapshot si quedan diffs nuevos con aprobado=null (pendientes de decisión).' },
    ],
    nota: 'El código de cargo tiene formato PREFIJO-XXXXXX (ej: CPH-000042). El prefijo se calcula a partir de escalafón + unificador + agrupador.',
  },
]

function ModalReglaNegocio({ onClose }: { onClose: () => void }) {
  const [stepIdx, setStepIdx] = useState(0)
  const step = PIPELINE_STEPS[stepIdx]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="font-primary text-lg font-bold text-gray-900">Procesamiento del padrón semanal</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reglas de negocio — flujo completo de carga</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Pipeline visual */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Pipeline de procesamiento</p>
            <div className="flex items-center gap-1 flex-wrap">
              {PIPELINE_STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setStepIdx(i)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      i === stepIdx
                        ? `${PC_BG[s.color]} ${PC_BORDER[s.color]} ${PC_TEXT[s.color]}`
                        : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <span className={`inline-block w-4 h-4 rounded-full text-[10px] font-bold mr-1.5 ${
                      i === stepIdx ? `${PC_BG[s.color]} ${PC_TEXT[s.color]}` : 'bg-gray-100 text-gray-400'
                    }`}>{i + 1}</span>
                    {s.label}
                  </button>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <span className="text-gray-300 text-xs">→</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Detalle del paso seleccionado */}
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Izquierda: cabecera + descripción + nota */}
              <div className="space-y-4">
                <div className={`rounded-lg border p-4 ${PC_BG[step.color]} ${PC_BORDER[step.color]}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${PC_BG[step.color]} ${PC_TEXT[step.color]} border ${PC_BORDER[step.color]}`}>
                      {stepIdx + 1}
                    </span>
                    <span className={`text-sm font-bold ${PC_TEXT[step.color]}`}>{step.titulo}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{step.desc}</p>
                </div>

                {/* Flujo de pasos del pipeline como mini-diagrama */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Posición en el pipeline</p>
                  <div className="space-y-1">
                    {PIPELINE_STEPS.map((s, i) => (
                      <div
                        key={s.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                          i === stepIdx
                            ? `${PC_BG[s.color]} ${PC_TEXT[s.color]} font-semibold`
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                        onClick={() => setStepIdx(i)}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          i === stepIdx ? PC_DOT[s.color] : 'bg-gray-200'
                        }`} />
                        {s.titulo}
                      </div>
                    ))}
                  </div>
                </div>

                {step.nota && (
                  <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2">
                    <p className="text-[10px] text-yellow-700">⚠️ {step.nota}</p>
                  </div>
                )}
              </div>

              {/* Derecha: items del paso */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Detalle</p>
                <div className="space-y-2">
                  {step.items.map((item, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 bg-white p-3">
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${PC_DOT[step.color]}`} />
                        <div>
                          <div className={`text-xs font-semibold ${PC_TEXT[step.color]}`}>{item.label}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{item.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tablas de referencia — siempre visible al pie */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Tablas de referencia en BD (actualizables sin rebuild)</p>
              <div className="flex flex-wrap gap-1.5">
                {['ref_agrupadores', 'ref_unificadores_puesto', 'ref_especialidades_cuil', 'ref_especialidad_por_puesto', 'hospitales'].map((t) => (
                  <span key={t} className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${PC_BADGE['blue']}`}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

export function PadronPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puedeSubir = can(user, 'padron', 'subir')
  const puedeEliminarSnap = can(user, 'padron', 'eliminar_snap')

  const [file, setFile] = useState<File | null>(null)
  const [fechaAsignada, setFechaAsignada] = useState(hoy())
  const [snapshotEnCurso, setSnapshotEnCurso] = useState<string | null>(null)
  const [modalRegla, setModalRegla] = useState(false)

  const { data: snapshots, isLoading: cargandoSnapshots } = useSnapshots()
  const upload = useUploadPadron()
  const deleteSnapshot = useDeleteSnapshot()
  const exportarSnapshot = useExportarSnapshot()
  const estado = useSnapshotEstado(snapshotEnCurso ?? undefined)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    const result = await upload.mutateAsync({ file, fechaAsignada })
    setSnapshotEnCurso(result.snapshotId)
    setFile(null)
  }

  const pipelineTerminado =
    estado.data && estado.data.estado !== EstadoSnapshot.PROCESANDO

  return (
    <div className="space-y-6">
      {puedeSubir && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="font-primary text-lg font-bold text-gray-900 mb-4">Subir padrón semanal</h2>

          {!snapshotEnCurso && (
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaAsignada">
                  Fecha del padrón
                </label>
                <input
                  id="fechaAsignada"
                  type="date"
                  value={fechaAsignada}
                  onChange={(e) => setFechaAsignada(e.target.value)}
                  className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="file">
                  Archivo Excel
                </label>
                <input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={!file || upload.isPending}>
                {upload.isPending ? 'Subiendo...' : 'Subir y procesar'}
              </button>
            </form>
          )}

          {upload.isError && (
            <p className="text-sm text-danger mt-3">
              No se pudo subir el archivo. Verificá el formato y volvé a intentar.
            </p>
          )}

          {snapshotEnCurso && (
            <div className="mt-2 space-y-3">
              {estado.isLoading && <p className="text-sm text-gray-400">Consultando estado...</p>}

              {estado.data?.estado === EstadoSnapshot.PROCESANDO && (
                <div className="flex items-center gap-3">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-sm text-gray-600">
                    {(estado.data.pasoActual && PASO_LABEL[estado.data.pasoActual]) ?? 'Procesando...'}
                  </p>
                </div>
              )}

              {estado.data?.estado === EstadoSnapshot.PENDIENTE && (
                <div className="flex items-center justify-between bg-green-50 rounded-md px-4 py-3">
                  <p className="text-sm text-gray-700">
                    Padrón procesado — {estado.data.totalRegistros} registros. Listo para revisar.
                  </p>
                  <Link to={`/padron/${snapshotEnCurso}`} className="btn-primary">
                    Ver diferencias
                  </Link>
                </div>
              )}

              {estado.data?.estado === EstadoSnapshot.ERROR && (
                <div className="bg-red-50 rounded-md px-4 py-3">
                  <p className="text-sm text-danger font-medium">Error al procesar el padrón</p>
                  <p className="text-sm text-gray-600 mt-1">{estado.data.errorMsg ?? 'Error desconocido'}</p>
                </div>
              )}

              {pipelineTerminado && (
                <button className="btn-outline" onClick={() => setSnapshotEnCurso(null)}>
                  Subir otro archivo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-primary text-lg font-bold text-gray-900">Historial de padrones</h2>
          <button
            onClick={() => setModalRegla(true)}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            ¿Cómo funciona?
          </button>
        </div>

        {cargandoSnapshots && <p className="p-6 text-sm text-gray-400">Cargando historial...</p>}

        {!cargandoSnapshots && (!snapshots || snapshots.length === 0) && (
          <p className="p-6 text-sm text-gray-400 text-center">Todavía no se subió ningún padrón.</p>
        )}

        {!cargandoSnapshots && snapshots && snapshots.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Archivo</th>
                <th className="px-4 py-3 font-semibold">Registros</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Subido por</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {snapshots.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.fechaAsignada}</td>
                  <td className="px-4 py-3 text-gray-600">{s.filename}</td>
                  <td className="px-4 py-3 text-gray-600">{s.totalRegistros}</td>
                  <td className="px-4 py-3">
                    <span className={ESTADO_BADGE[s.estado] ?? 'badge-warning'}>
                      {ESTADO_LABEL[s.estado] ?? s.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.procesadoPor?.username ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {(s.estado === EstadoSnapshot.PENDIENTE ||
                      s.estado === EstadoSnapshot.APROBADO ||
                      s.estado === EstadoSnapshot.RECHAZADO) && (
                      <button className="btn-outline" onClick={() => navigate(`/padron/${s.id}`)}>
                        Ver
                      </button>
                    )}
                    {(s.estado === EstadoSnapshot.PENDIENTE || s.estado === EstadoSnapshot.APROBADO) && (
                      <button
                        className="btn-outline ml-2"
                        disabled={exportarSnapshot.isPending}
                        onClick={() => exportarSnapshot.mutate(s.id)}
                      >
                        ↓ Excel
                      </button>
                    )}
                    {puedeEliminarSnap && (s.estado === EstadoSnapshot.ERROR || s.estado === EstadoSnapshot.RECHAZADO) && (
                      <button
                        className="btn-danger ml-2"
                        disabled={deleteSnapshot.isPending}
                        onClick={() => {
                          if (confirm('¿Eliminar esta subida? Esta acción no se puede deshacer.')) {
                            deleteSnapshot.mutate(s.id)
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalRegla && <ModalReglaNegocio onClose={() => setModalRegla(false)} />}
    </div>
  )
}
