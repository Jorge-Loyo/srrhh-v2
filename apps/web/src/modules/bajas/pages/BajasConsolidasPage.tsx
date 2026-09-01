import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/hooks/useAuth'
import { RolUsuario } from '@srrhh/types'
import {
  useBajasSialSnapshots,
  useBajasSialEstado,
  useUploadBajasSial,
} from '../hooks/useBajasSial'

function hoy() { return new Date().toISOString().slice(0, 10) }

const ESTADO_BADGE: Record<string, string> = {
  procesando: 'badge-warning',
  pendiente:  'badge-warning',
  aprobado:   'badge-success',
  rechazado:  'badge-danger',
  error:      'badge-danger',
}
const ESTADO_LABEL: Record<string, string> = {
  procesando: 'Procesando',
  pendiente:  'Pendiente de revisión',
  aprobado:   'Aprobado',
  rechazado:  'Rechazado',
  error:      'Error',
}

export function BajasConsolidasPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puedeSubir = user?.rol === RolUsuario.ADMIN || user?.rol === RolUsuario.EDITOR

  const [file, setFile] = useState<File | null>(null)
  const [fechaArchivo, setFechaArchivo] = useState(hoy())
  const [snapshotEnCurso, setSnapshotEnCurso] = useState<string | null>(null)

  const { data: snapshots, isLoading } = useBajasSialSnapshots()
  const upload = useUploadBajasSial()
  const estado = useBajasSialEstado(snapshotEnCurso)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    const result = await upload.mutateAsync({ file, fechaArchivo })
    setSnapshotEnCurso(result.snapshotId)
    setFile(null)
  }

  const pipelineTerminado = estado.data && estado.data.estado !== 'procesando'

  return (
    <div className="space-y-6">

      {puedeSubir && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="font-primary text-lg font-bold text-gray-900 mb-1">Subir archivo de bajas SIAL</h2>
          <p className="text-sm text-gray-500 mb-4">
            Archivo semanal <span className="font-mono">Bajas_salud_YYYYMMDD.xlsx</span> — se compara contra el archivo anterior aprobado y se triangula con personas y ocupaciones activas.
          </p>

          {!snapshotEnCurso && (
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del archivo</label>
                <input
                  type="date" value={fechaArchivo}
                  onChange={(e) => setFechaArchivo(e.target.value)}
                  className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Archivo Excel</label>
                <input
                  type="file" accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm" required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={!file || upload.isPending}>
                {upload.isPending ? 'Subiendo...' : 'Subir y procesar'}
              </button>
            </form>
          )}

          {upload.isError && (
            <p className="text-sm text-danger mt-3">No se pudo subir el archivo. Verificá el formato.</p>
          )}

          {snapshotEnCurso && (
            <div className="mt-3 space-y-3">
              {estado.data?.estado === 'procesando' && (
                <div className="flex items-center gap-3">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-sm text-gray-600">Procesando archivo y triangulando con personas...</p>
                </div>
              )}
              {estado.data?.estado === 'pendiente' && (
                <div className="flex items-center justify-between bg-green-50 rounded-md px-4 py-3">
                  <p className="text-sm text-gray-700">
                    Archivo procesado — {estado.data.total_registros.toLocaleString('es-AR')} registros.
                    <span className="ml-2 text-green-700 font-semibold">+{estado.data.nuevas} nuevas</span>
                    <span className="ml-2 text-red-600 font-semibold">−{estado.data.salidas} salidas</span>
                    <span className="ml-2 text-orange-600 font-semibold">~{estado.data.modificadas} modificadas</span>
                  </p>
                  <Link to={`/bajas-consolidadas/${snapshotEnCurso}`} className="btn-primary">
                    Ver diferencias
                  </Link>
                </div>
              )}
              {estado.data?.estado === 'error' && (
                <div className="bg-red-50 rounded-md px-4 py-3">
                  <p className="text-sm text-danger font-medium">Error al procesar</p>
                  <p className="text-sm text-gray-600 mt-1">{estado.data.error_msg ?? 'Error desconocido'}</p>
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

      {/* Historial */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-primary text-lg font-bold text-gray-900">Historial de archivos de bajas</h2>
          <p className="text-xs text-gray-400 mt-0.5">Diferencias calculadas respecto al archivo anterior aprobado</p>
        </div>

        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando historial...</p>}
        {!isLoading && (!snapshots || snapshots.length === 0) && (
          <p className="p-6 text-sm text-gray-400 text-center">Todavía no se subió ningún archivo.</p>
        )}

        {!isLoading && snapshots && snapshots.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha archivo</th>
                <th className="px-4 py-3 font-semibold">Archivo</th>
                <th className="px-4 py-3 font-semibold">Registros</th>
                <th className="px-4 py-3 font-semibold text-green-300">+ Nuevas</th>
                <th className="px-4 py-3 font-semibold text-red-300">− Salidas</th>
                <th className="px-4 py-3 font-semibold text-orange-300">~ Modif.</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {snapshots.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {new Date(s.fecha_archivo).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.filename}</td>
                  <td className="px-4 py-3 text-gray-600">{s.total_registros.toLocaleString('es-AR')}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">
                    {s.nuevas > 0 ? `+${s.nuevas}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-red-600">
                    {s.salidas > 0 ? `−${s.salidas}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-orange-600">
                    {s.modificadas > 0 ? `~${s.modificadas}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={ESTADO_BADGE[s.estado] ?? 'badge-warning'}>
                      {ESTADO_LABEL[s.estado] ?? s.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(s.estado === 'pendiente' || s.estado === 'aprobado' || s.estado === 'rechazado') && (
                      <button className="btn-outline" onClick={() => navigate(`/bajas-consolidadas/${s.id}`)}>
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
