import { useRef, useState } from 'react'
import { ArrowUpTrayIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { useSubirEstructuraOrganigrama, useOrganigramaUploads } from '../hooks/useOrganigrama'

const COLUMNAS_OBLIGATORIAS = ['lvl', 'tipo', 'codigo_reparticion', 'sigla', 'path', 'path_nombres']
const COLUMNAS_OPCIONALES = ['universo_totalizador', 'regimen_empleo', 'desc_rep', 'padre']

export function OrganigramaArbolPage() {
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const subir = useSubirEstructuraOrganigrama()
  const { data: uploads, isLoading: loadingUploads } = useOrganigramaUploads()

  async function handleFile(file: File) {
    setError('')
    setResultado(null)
    setFileName(file.name)
    try {
      const res = await subir.mutateAsync(file)
      setResultado(res.filas)
    } catch (err) {
      setError(getApiErrorMessage(err))
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

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <strong>Operación destructiva:</strong> al subir un archivo se borra toda la estructura actual y se
        reemplaza por completo con el contenido del Excel. No hay forma de deshacerlo desde acá.
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
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-300 hover:bg-primary-50/30 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file) handleFile(file)
          }}
        >
          <DocumentArrowUpIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600">
            {fileName || 'Arrastrá el Excel acá, o hacé click para elegirlo'}
          </p>
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

        {error && <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">{error}</div>}
        {resultado !== null && (
          <div className="bg-green-50 border border-green-300 text-green-800 text-sm px-3 py-2 rounded">
            ✅ Estructura reemplazada — {resultado.toLocaleString('es-AR')} filas cargadas.
          </div>
        )}
      </div>

      {/* Historial de cargas */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Historial de cargas</h2>
        {loadingUploads ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : !uploads?.length ? (
          <p className="text-sm text-gray-400">No hay cargas registradas.</p>
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
