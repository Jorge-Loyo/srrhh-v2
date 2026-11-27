import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DocumentArrowUpIcon } from '@heroicons/react/24/outline'
import { getApiErrorMessage } from '@/shared/lib/utils'
import {
  useSubirCargaSemanal,
  useCargaSesiones,
  useDescartarCarga,
  useConfirmarCarga,
  LABEL_TIPO,
  ICONO_TIPO,
  COLOR_ESTADO,
  detectarTipoPorFilename,
  type TipoCarga,
} from '../hooks/useCargaSemanal'
import { useQueryClient } from '@tanstack/react-query'

export function CargaSemanalPage() {
  const navigate  = useNavigate()
  const inputRef  = useRef<HTMLInputElement>(null)
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([])
  const [error, setError] = useState('')

  const subir    = useSubirCargaSemanal()
  const descartar = useDescartarCarga()
  const confirmar = useConfirmarCarga()
  const queryClient = useQueryClient()
  const { data, isLoading, refetch } = useCargaSesiones({ limit: 20 } as never)
  const sesiones = data?.data ?? []

  async function handleConfirmar(sesionId: string) {
    setError('')
    try {
      await confirmar.mutateAsync({ sesionId, resoluciones: {} })
      // Polling hasta que el estado cambie de pendiente_confirmacion
      const poll = setInterval(async () => {
        const result = await refetch()
        const sesion = result.data?.data.find((s) => s.id === sesionId)
        if (!sesion || sesion.estado !== 'pendiente_confirmacion') clearInterval(poll)
      }, 2000)
      setTimeout(() => clearInterval(poll), 120_000)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  function handleSeleccion(files: File[]) {
    const xlsx = files.filter((f) => /\.xlsx?$/i.test(f.name))
    if (!xlsx.length) return
    setArchivosSeleccionados((prev) => {
      const nombres = new Set(prev.map((f) => f.name))
      return [...prev, ...xlsx.filter((f) => !nombres.has(f.name))]
    })
    setError('')
  }

  async function handleProcesar() {
    if (!archivosSeleccionados.length) return
    setError('')
    try {
      const res = await subir.mutateAsync(archivosSeleccionados)
      setArchivosSeleccionados([])
      navigate(`/carga-semanal/${res.sesionId}`)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-primary text-2xl font-bold text-gray-900">Carga semanal de archivos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Seleccioná los archivos, revisá los tipos detectados y presioná Procesar.
          El orden de aplicación es: Bajas → Cargos → POU → Árbol.
        </p>
      </div>

      {/* Selector */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-300 hover:bg-blue-50/20 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleSeleccion(Array.from(e.dataTransfer.files)) }}
        >
          <DocumentArrowUpIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600">Arrastrá los Excel acá o hacé click para elegirlos</p>
          <p className="text-xs text-gray-400 mt-1">Podés subir Cargos + Bajas + Árbol + POU juntos</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => { handleSeleccion(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />
        </div>

        {archivosSeleccionados.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Archivos seleccionados ({archivosSeleccionados.length})
            </p>
            <ul className="divide-y divide-gray-100 border rounded">
              {archivosSeleccionados.map((f) => {
                const tipo = detectarTipoPorFilename(f.name)
                return (
                  <li key={f.name} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{tipo ? ICONO_TIPO[tipo as TipoCarga] : '📄'}</span>
                      <span className="font-mono text-gray-700 truncate">{f.name}</span>
                      {tipo
                        ? <span className="text-xs text-gray-400 shrink-0">— {LABEL_TIPO[tipo as TipoCarga]}</span>
                        : <span className="text-xs text-red-500 shrink-0">— tipo no reconocido</span>
                      }
                    </div>
                    <button
                      onClick={() => setArchivosSeleccionados((p) => p.filter((x) => x.name !== f.name))}
                      className="text-gray-400 hover:text-red-500 ml-3 shrink-0 text-lg leading-none"
                    >×</button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!archivosSeleccionados.length || subir.isPending}
            onClick={handleProcesar}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            {subir.isPending ? '⏳ Procesando...' : '▶ Procesar archivos'}
          </button>
          {archivosSeleccionados.length > 0 && (
            <button
              type="button"
              onClick={() => setArchivosSeleccionados([])}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Limpiar selección
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
        )}
      </div>

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
                  {['Tipo','Archivo','Filas','Estado','Usuario','Fecha',''].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sesiones.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      <span className="mr-1">{ICONO_TIPO[s.tipo]}</span>{LABEL_TIPO[s.tipo]}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 max-w-[180px] truncate">
                      {s.archivos[0]?.filename ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">
                      {s.archivos[0]?.filas != null ? s.archivos[0].filas.toLocaleString('es-AR') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_ESTADO[s.estado]}`}>
                        {s.estado === 'procesando'              ? '⏳ procesando'
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
                      <div className="flex gap-2 items-center justify-end">
                        {s.estado === 'pendiente_confirmacion' && (
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-blue-500 text-white text-xs font-medium hover:bg-blue-600"
                            onClick={() => navigate(`/carga-semanal/${s.id}`)}
                          >
                            Revisar
                          </button>
                        )}
                        {(s.estado === 'pendiente_confirmacion' || s.estado === 'error') && (
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-red-400 text-white text-xs font-medium hover:bg-red-500"
                            onClick={() => descartar.mutate(s.id)}
                          >
                            Descartar
                          </button>
                        )}
                        {s.estado === 'pendiente_confirmacion' && (
                          <button
                            type="button"
                            disabled={confirmar.isPending}
                            className="px-2 py-1 rounded bg-yellow-400 text-white text-xs font-semibold hover:bg-yellow-500 disabled:opacity-40"
                            onClick={() => handleConfirmar(s.id)}
                          >
                            {confirmar.isPending ? '...' : 'Confirmar'}
                          </button>
                        )}
                      </div>
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
