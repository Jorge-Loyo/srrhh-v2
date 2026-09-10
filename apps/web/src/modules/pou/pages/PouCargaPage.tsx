import { useRef, useState } from 'react'
import { ArrowUpTrayIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { useSubirPou } from '../hooks/usePou'

// Módulo de carga — admin sube el Excel mensual de ocupación POU ("Ocupacion_POU_MM-YY.xlsx")
// y reemplaza toda la tabla `pou`. Puerto del módulo "Árbol" del organigrama,
// adaptado a los requisitos puntuales del archivo POU (hoja "Base" obligatoria).
export function PouCargaPage() {
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const subir = useSubirPou()

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
        <h1 className="font-primary text-2xl font-bold text-gray-900">POU — Carga de dotación</h1>
        <p className="text-sm text-gray-500 mt-1">
          Subí el Excel mensual de ocupación POU para reemplazar toda la tabla. No hay histórico:
          cada carga pisa por completo los datos anteriores.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <strong>Operación destructiva:</strong> al subir un archivo se borra toda la dotación POU actual y se
        reemplaza por completo con el contenido del Excel. No hay forma de deshacerlo desde acá.
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-2">Formato esperado</h2>
          <p className="text-xs text-gray-500">
            El archivo debe tener una hoja llamada <span className="font-mono">Base</span> con las columnas:
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {['SIGLA', 'PERFIL', 'ESPECIALIDAD'].map((c) => (
              <span key={c} className="font-mono text-xs px-2 py-1 rounded bg-gray-800 text-white">
                {c} <span className="text-gray-400">*</span>
              </span>
            ))}
            {['Descrip. Sigla', 'Dotación Diaria', 'Dotación Sem', 'Dotación Total', 'Activos', 'Técnicos', 'Vacantes'].map((c) => (
              <span key={c} className="font-mono text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">
                {c}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * obligatorias. La columna <span className="font-mono">Vacantes</span> aparece dos veces en el archivo real
            (Base + resumen SG) — se toma la primera.
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
            ✅ Dotación POU reemplazada — {resultado.toLocaleString('es-AR')} filas cargadas.
          </div>
        )}
      </div>
    </div>
  )
}
