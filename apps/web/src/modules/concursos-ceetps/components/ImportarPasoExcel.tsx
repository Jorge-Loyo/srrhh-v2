import { useRef, useState } from 'react'
import { useToast } from '@/shared/components/ui/useToast'
import { useImportarInscriptosCeetps } from '../hooks/useCeetpsWizard'
import type { PasoCeetps } from '../lib/inscriptosCeetps'

// Importación de un paso desde un Excel. Se muestra SIEMPRE, junto al botón, cómo
// debe estar armado el archivo (columnas por paso). El archivo se lee en el
// navegador y el backend interpreta y valida cada fila.

type PasoImportable = Exclude<PasoCeetps, 'orden'>

interface Estructura {
  columnas: string
  detalle: string
}

const ESTRUCTURA: Record<PasoImportable, Estructura> = {
  inscripcion: {
    columnas: 'Apellido · Nombre · DNI · CUIL · Email · Teléfono · Entregó documentación',
    detalle:
      'Se necesita el DNI o el CUIL de cada persona. Apellido y Nombre son obligatorios para inscribir a alguien nuevo. "Entregó documentación" es SI o NO (opcional). Quien ya está inscripto (mismo DNI o CUIL) se actualiza, no se duplica.',
  },
  admisibilidad: {
    columnas: 'DNI (o CUIL) · Admitido · Motivo',
    detalle:
      '"Admitido" es SI o NO. "Motivo" es opcional y se usa para quienes no fueron admitidos. Las personas tienen que estar ya inscriptas.',
  },
  examen: {
    columnas: 'DNI (o CUIL) · Se presentó · Nota',
    detalle:
      '"Se presentó" es SI o NO (si hay nota y se deja vacío, se toma como presentado). La nota es un número de 0 a 1000; se acepta coma o punto decimal.',
  },
  cv: {
    columnas: 'DNI (o CUIL) · Puntaje',
    detalle: 'El puntaje del análisis curricular es un número de 0 a 1000.',
  },
  entrevista: {
    columnas: 'DNI (o CUIL) · Puntaje',
    detalle: 'El puntaje de la entrevista es un número de 0 a 1000.',
  },
}

function mensajeError(e: unknown): string {
  const data = (e as { response?: { data?: { error?: { message?: string }; message?: string } } })
    ?.response?.data
  return data?.error?.message ?? data?.message ?? 'No se pudo importar el archivo.'
}

export function ImportarPasoExcel({
  concursoId,
  paso,
  deshabilitado,
}: {
  concursoId: string
  paso: PasoImportable
  deshabilitado: boolean
}) {
  const { toast, ToastUI } = useToast()
  const importar = useImportarInscriptosCeetps(concursoId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [resultado, setResultado] = useState<{
    creados: number
    actualizados: number
    errores: { fila: number; motivo: string }[]
  } | null>(null)
  const estructura = ESTRUCTURA[paso]

  async function onArchivo(file: File) {
    setResultado(null)
    setLeyendo(true)
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.read(await file.arrayBuffer())
      const hoja = libro.Sheets[libro.SheetNames[0]!]
      const filas = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(
        hoja!,
        { defval: null, raw: true },
      )
      if (filas.length === 0) {
        toast.error('El archivo no tiene filas. La primera fila tiene que ser el encabezado.')
        return
      }
      const r = await importar.mutateAsync({ paso, filas })
      setResultado(r)
      if (r.errores.length === 0)
        toast.success(`Importado: ${r.creados} nuevos, ${r.actualizados} actualizados.`)
    } catch (e) {
      toast.error(mensajeError(e))
    } finally {
      setLeyendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 space-y-2">
      {ToastUI}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-blue-900">Importar desde Excel</p>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onArchivo(f)
            }}
          />
          <button
            type="button"
            className="btn-outline text-xs"
            disabled={deshabilitado || leyendo || importar.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {leyendo || importar.isPending ? 'Importando…' : '📥 Elegir archivo…'}
          </button>
        </div>
      </div>
      <div className="text-xs text-blue-900 space-y-1">
        <p>
          <span className="font-semibold">Cómo debe ser el archivo:</span> una hoja con el
          encabezado en la primera fila y estas columnas:{' '}
          <span className="font-mono">{estructura.columnas}</span>
        </p>
        <p className="text-blue-800">{estructura.detalle}</p>
      </div>
      {resultado && (
        <div className="rounded border border-blue-200 bg-white px-3 py-2 text-xs space-y-1">
          <p className="font-semibold text-gray-800">
            {resultado.creados} nuevos · {resultado.actualizados} actualizados ·{' '}
            {resultado.errores.length} con error
          </p>
          {resultado.errores.length > 0 && (
            <>
              <p className="text-gray-500">
                Las filas con error no se importaron; las demás sí. Corregí el Excel y volvé a
                importar solo esas.
              </p>
              <ul className="max-h-28 overflow-y-auto space-y-0.5 text-red-700">
                {resultado.errores.map((er, i) => (
                  <li key={i}>
                    Fila {er.fila}: {er.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
