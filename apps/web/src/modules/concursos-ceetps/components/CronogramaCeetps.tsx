import { useEffect, useState } from 'react'
import {
  CRONOGRAMA_CEETPS_PASOS,
  errorEnCadenaFechas,
  type ClaveCronogramaCeetps,
  type FechasCadenaCeetps,
} from '@srrhh/types'
import { useToast } from '@/shared/components/ui/useToast'
import { usePatchConcursoCeetps } from '../hooks/useCeetpsWizard'
import { PASOS_CEETPS, type PasoCeetps } from '../lib/inscriptosCeetps'
import { CRONOGRAMA_POR_PASO } from '../lib/pasosVista'

// Etapa 3 del wizard CEETPS: fechas del cronograma del proceso concursal (una
// por hito, de la publicación a la adjudicación). Se guardan todas juntas.

type Cronograma = Partial<Record<ClaveCronogramaCeetps, string | null>>

function mensajeError(e: unknown): string {
  const data = (e as { response?: { data?: { error?: { message?: string }; message?: string } } })
    ?.response?.data
  return data?.error?.message ?? data?.message ?? 'No se pudo guardar el cronograma.'
}

export function CronogramaCeetps({
  concursoId,
  cronograma,
  fechasActuales,
  pasoEnCurso,
  bloqueado,
}: {
  concursoId: string
  /** Fechas actuales del concurso (cadena completa), para validar el orden. */
  fechasActuales: FechasCadenaCeetps
  /** Paso del concurso en el que está: se resaltan sus hitos. */
  pasoEnCurso: PasoCeetps
  cronograma: Cronograma | null | undefined
  bloqueado: boolean
}) {
  const { toast, ToastUI } = useToast()
  const patch = usePatchConcursoCeetps(concursoId)
  const [fechas, setFechas] = useState<Cronograma>({})
  useEffect(() => setFechas(cronograma ?? {}), [cronograma])

  const cambio = CRONOGRAMA_CEETPS_PASOS.some(
    (p) => (fechas[p.key] || null) !== (cronograma?.[p.key] || null),
  )

  function guardar() {
    const body: Cronograma = {}
    for (const p of CRONOGRAMA_CEETPS_PASOS) body[p.key] = fechas[p.key] || null
    // Las fechas no pueden ir para atrás respecto del resto del concurso.
    const error = errorEnCadenaFechas(
      fechasActuales,
      Object.fromEntries(Object.entries(body).map(([k, v]) => [`cronograma.${k}`, v])),
    )
    if (error) {
      toast.error(error)
      return
    }
    patch.mutate(
      { cronograma: body },
      {
        onSuccess: () => toast.success('Cronograma guardado.'),
        onError: (e) => toast.error(mensajeError(e)),
      },
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 space-y-3">
      {ToastUI}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Cronograma del concurso</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Fecha de cada hito del proceso concursal. Se pueden completar a medida que avanza.
          </p>
        </div>
        <button
          className="btn-primary text-sm shrink-0"
          disabled={bloqueado || patch.isPending || !cambio}
          onClick={guardar}
        >
          {patch.isPending ? 'Guardando…' : 'Guardar cronograma'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {CRONOGRAMA_CEETPS_PASOS.map((p, i) => {
          const enCurso = CRONOGRAMA_POR_PASO[pasoEnCurso].includes(p.key)
          return (
            <label
              key={p.key}
              className={`flex items-center gap-3 rounded-md px-2 py-1 ${
                enCurso ? 'bg-navy/5 ring-1 ring-navy/40' : ''
              }`}
            >
              <span className="w-5 text-[11px] text-gray-400 text-right shrink-0">{i + 1}</span>
              <span className="flex-1 text-xs text-gray-700">
                {p.label}
                {enCurso && (
                  <span className="ml-2 rounded-full bg-navy px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    En curso · {PASOS_CEETPS.find((x) => x.id === pasoEnCurso)?.label}
                  </span>
                )}
              </span>
              <input
                type="date"
                value={fechas[p.key] ?? ''}
                disabled={bloqueado}
                onChange={(e) => setFechas((f) => ({ ...f, [p.key]: e.target.value || null }))}
                className="input h-9 w-40 shrink-0"
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}
