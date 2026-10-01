import { useRef, useState } from 'react'
import { ArrowUpTrayIcon, DocumentArrowUpIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { useSubirEstructuraOrganigrama, useOrganigramaUploads } from '../hooks/useOrganigrama'

const COLUMNAS_OBLIGATORIAS = ['lvl', 'tipo', 'codigo_reparticion', 'sigla', 'path', 'path_nombres']
const COLUMNAS_OPCIONALES = ['universo_totalizador', 'regimen_empleo', 'desc_rep', 'padre']

// Repartición nueva sin régimen que el backend no pudo inferir (details del 400).
interface ReparticionPendiente {
  codigoReparticion: string
  tipo: string
  descRep: string | null
  sigla: string
  universoSugerido: string
}
interface DetalleRegimenPendiente {
  tipo: 'regimen_pendiente'
  tablaVacia: boolean
  pendientes: ReparticionPendiente[]
}

// Extrae el details estructurado del error de axios (si es el 400 de régimen
// pendiente). Permite mostrar la lista como tabla en vez de un párrafo rojo.
function extraerPendientes(err: unknown): DetalleRegimenPendiente | null {
  const details = (err as { response?: { data?: { error?: { details?: unknown } } } })?.response?.data?.error?.details
  if (details && typeof details === 'object' && (details as DetalleRegimenPendiente).tipo === 'regimen_pendiente') {
    return details as DetalleRegimenPendiente
  }
  return null
}

export function OrganigramaArbolPage() {
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [pendientes, setPendientes] = useState<DetalleRegimenPendiente | null>(null)
  const [resultado, setResultado] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const subir = useSubirEstructuraOrganigrama()
  const { data: uploads, isLoading: loadingUploads } = useOrganigramaUploads()

  async function handleFile(file: File) {
    setError('')
    setPendientes(null)
    setResultado(null)
    setFileName(file.name)
    try {
      const res = await subir.mutateAsync(file)
      setResultado(res.filas)
    } catch (err) {
      const det = extraerPendientes(err)
      if (det) setPendientes(det)
      else setError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-primary text-2xl font-bold text-gray-900">Árbol — Estructura del organigrama</h1>
        <p className="text-sm text-gray-500 mt-1">
          Subí un Excel para reemplazar toda la jerarquía de unidades organizativas que usa el módulo
          Organigrama. Esto no afecta quién aparece asignado a cada puesto — eso sale de Cargos/Ocupaciones,
          no de este árbol.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex gap-2.5">
        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
        <span>
          <strong>Operación destructiva:</strong> al subir un archivo se borra toda la estructura actual y se
          reemplaza por completo con el contenido del Excel. No hay forma de deshacerlo desde acá.
        </span>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-2">Columnas esperadas (primera fila = encabezados)</h2>
          <div className="flex flex-wrap gap-1.5">
            {COLUMNAS_OBLIGATORIAS.map((c) => (
              <span key={c} className="font-mono text-xs px-2 py-1 rounded bg-gray-800 text-white">
                {c} <span className="text-gray-400">*</span>
              </span>
            ))}
            {COLUMNAS_OPCIONALES.map((c) => (
              <span key={c} className="font-mono text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">
                {c}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * obligatorias. No importa mayúsculas ni separador espacio/guión bajo. También se acepta{' '}
            <span className="font-mono">COD_REP</span> como sinónimo de{' '}
            <span className="font-mono">codigo_reparticion</span>.
          </p>
        </div>

        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            subir.isPending
              ? 'border-primary-300 bg-primary-50/40 cursor-wait'
              : 'border-gray-300 hover:border-primary-300 hover:bg-primary-50/30 cursor-pointer'
          }`}
          onClick={() => !subir.isPending && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (subir.isPending) return
            const file = e.dataTransfer.files?.[0]
            if (file) handleFile(file)
          }}
        >
          {subir.isPending ? (
            <>
              <div className="w-10 h-10 mx-auto mb-2 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Procesando <span className="font-medium">{fileName}</span>…</p>
              <p className="text-xs text-gray-400 mt-1">Validando e importando la estructura. Puede tardar unos segundos.</p>
            </>
          ) : (
            <>
              <DocumentArrowUpIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-600">
                {fileName || 'Arrastrá el Excel acá, o hacé click para elegirlo'}
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
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

        {/* Error genérico */}
        {error && (
          <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">{error}</div>
        )}

        {/* Reparticiones nuevas sin REGIMEN EMPLEO — vista estructurada */}
        {pendientes && (
          <div className="border border-amber-300 rounded-lg overflow-hidden">
            <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
                {pendientes.pendientes.length} repartición(es) nueva(s) sin <span className="font-mono">REGIMEN EMPLEO</span>
              </p>
              <p className="text-xs text-amber-700 mt-1">
                No se pudo inferir el régimen de estas reparticiones nuevas. Agregá la columna{' '}
                <span className="font-mono">REGIMEN EMPLEO</span> con el valor correspondiente para estos códigos
                y volvé a subir el archivo. El resto del árbol no se tocó.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2">Sigla</th>
                    <th className="px-3 py-2">Universo sugerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendientes.pendientes.map((p) => (
                    <tr key={p.codigoReparticion} className="hover:bg-amber-50/40">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{p.codigoReparticion}</td>
                      <td className="px-3 py-2 text-gray-600">{p.tipo}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[260px]">{p.descRep ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.sigla}</td>
                      <td className="px-3 py-2 text-gray-500">{p.universoSugerido}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pendientes.tablaVacia && (
              <div className="bg-blue-50 border-t border-blue-200 px-4 py-3 text-xs text-blue-800">
                La estructura actual está vacía. Si es una carga inicial, primero cargá el histórico ya
                clasificado (con la columna <span className="font-mono">REGIMEN EMPLEO</span> completa) y usá esta
                pantalla luego para altas puntuales.
              </div>
            )}
          </div>
        )}

        {/* Éxito */}
        {resultado !== null && (
          <div className="bg-green-50 border border-green-300 text-green-800 text-sm px-3 py-2 rounded flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
            Estructura reemplazada — {resultado.toLocaleString('es-AR')} filas cargadas.
          </div>
        )}
      </div>

      {/* Historial de cargas */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Historial de cargas</h2>
        {loadingUploads ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : !uploads?.length ? (
          <p className="text-sm text-gray-400">
            Todavía no se registró ninguna carga desde esta pantalla. Las cargas hechas por script
            (histórico inicial) no aparecen acá.
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Archivo</th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Filas</th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Subido por</th>
                <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-700 font-mono text-xs max-w-[220px] truncate" title={u.filename}>
                    {u.filename}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{u.filas.toLocaleString('es-AR')}</td>
                  <td className="py-2 pr-4 text-gray-600">{u.subidoPor?.username ?? '—'}</td>
                  <td className="py-2 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
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
