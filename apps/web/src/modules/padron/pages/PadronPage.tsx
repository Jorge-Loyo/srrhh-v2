import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EstadoSnapshot, RolUsuario } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { useSnapshotEstado, useSnapshots, useUploadPadron } from '../hooks/usePadron'

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

// pasoActual lo escribe runPipeline() (S2-18) en Node, en cada etapa del
// pipeline en background — acá solo se traducen a texto amigable.
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

export function PadronPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puedeSubir = user?.rol === RolUsuario.ADMIN || user?.rol === RolUsuario.EDITOR

  const [file, setFile] = useState<File | null>(null)
  const [fechaAsignada, setFechaAsignada] = useState(hoy())
  const [snapshotEnCurso, setSnapshotEnCurso] = useState<string | null>(null)

  const { data: snapshots, isLoading: cargandoSnapshots } = useSnapshots()
  const upload = useUploadPadron()
  const estado = useSnapshotEstado(snapshotEnCurso ?? undefined)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    const result = await upload.mutateAsync({ file, fechaAsignada })
    setSnapshotEnCurso(result.snapshotId)
    setFile(null)
  }

  // Una vez que el pipeline en background termina (pendiente/error), dejamos
  // de pollear ese snapshot — el usuario decide desde acá si entra al diff o
  // reintenta. useSnapshotEstado ya corta el refetchInterval solo.
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

          {/* Progreso del pipeline en background (S2-18) */}
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
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-primary text-lg font-bold text-gray-900">Historial de padrones</h2>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
