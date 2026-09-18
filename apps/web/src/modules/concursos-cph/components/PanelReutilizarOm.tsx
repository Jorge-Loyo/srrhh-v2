// Panel de reutilización de orden de mérito. Se usa en la Etapa 1 (Baja/
// Apertura) para reservar un candidato antes de solicitar la autorización, y en
// la Etapa 4 (IFACS/INSAL) para gestionar el candidato reservado: si no acepta
// el cargo (INSAL) se lo anula y se elige otro; si no quedan disponibles, se
// avisa que hay que declarar desierto.
//
// Reservar un integrante lo marca como designado en la OM de origen y lo
// registra como persona designada del concurso — NO finaliza el concurso.
import {
  useOmCompatibles,
  useReservarIntegranteOm,
  useRechazarIntegranteOm,
  useCandidatoOm,
} from '../hooks/useConcursosCph'
import { useToast } from '@/shared/components/ui/useToast'

function msgError(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message ?? fallback
  )
}

export function PanelReutilizarOm({ concursoId }: { concursoId: string }) {
  const { data: compatibles = [], isLoading } = useOmCompatibles(concursoId)
  const { data: candidato } = useCandidatoOm(concursoId)
  const reservar = useReservarIntegranteOm(concursoId)
  const rechazar = useRechazarIntegranteOm(concursoId)
  const { toast, ToastUI } = useToast()

  const hayDisponibles = compatibles.some((o) =>
    o.integrantes.some((i) => !i.designado && !i.anulado),
  )

  // Si no hay candidato reservado ni OM con disponibles, no mostramos nada.
  if (isLoading) return null
  if (!candidato && (compatibles.length === 0 || !hayDisponibles)) return null

  return (
    <div className="rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-4">
      <p className="text-sm font-semibold text-gray-800">Orden de mérito reutilizable</p>

      {/* Candidato reservado actual (Etapa 4): permite marcar que no aceptó */}
      {candidato && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            Candidato reservado: <strong>{candidato.integrante.apellidoNombre}</strong> (posición{' '}
            {candidato.integrante.posicion})
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              className="btn-outline border-red-300 px-2 py-1 text-xs text-danger"
              disabled={rechazar.isPending}
              onClick={async () => {
                try {
                  const r = await rechazar.mutateAsync({ integranteId: candidato.integrante.id })
                  if (r.disponiblesRestantes > 0) {
                    toast.info(
                      `Candidato anulado. Quedan ${r.disponiblesRestantes} disponible(s) para reelegir.`,
                    )
                  } else {
                    toast.info(
                      'Candidato anulado. No quedan más candidatos en la orden de mérito: se debe declarar desierto.',
                    )
                  }
                } catch (e) {
                  toast.error(msgError(e, 'No se pudo anular el candidato'))
                }
              }}
            >
              No aceptó el cargo
            </button>
            <span className="text-[11px] text-gray-500">
              Al no aceptar, se anula y podés elegir otro de la orden de mérito.
            </span>
          </div>
        </div>
      )}

      {/* Listado de OM compatibles con disponibles para reservar / reelegir */}
      {hayDisponibles ? (
        <>
          <p className="mb-2 mt-3 text-xs text-gray-500">
            {candidato
              ? 'Elegí otro integrante disponible:'
              : 'Podés tomar un integrante disponible para este concurso (queda reservado como persona designada; la designación formal es un paso aparte).'}
          </p>
          <div className="space-y-3">
            {compatibles.map((o) => {
              const disponibles = o.integrantes.filter((i) => !i.designado && !i.anulado)
              if (disponibles.length === 0) return null
              return (
                <div key={o.id} className="rounded border border-gray-200 bg-white p-3">
                  <p className="mb-2 text-xs font-medium text-gray-700">
                    {o.concursoCph?.concurso?.cargo?.codigo ?? o.puesto ?? 'OM'} · {o.especialidad}{' '}
                    · vence {o.fechaVencimiento.slice(0, 10).split('-').reverse().join('/')}
                  </p>
                  <ul className="space-y-1">
                    {disponibles.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                        <span>
                          <span className="font-mono text-gray-400">{i.posicion}.</span>{' '}
                          {i.apellidoNombre}
                        </span>
                        <button
                          className="btn-outline px-2 py-1 text-xs"
                          disabled={reservar.isPending}
                          onClick={async () => {
                            try {
                              await reservar.mutateAsync(i.id)
                              toast.success(`${i.apellidoNombre} reservado para este concurso`)
                            } catch (e) {
                              toast.error(msgError(e, 'No se pudo reservar el integrante'))
                            }
                          }}
                        >
                          Tomar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        candidato && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            No quedan más candidatos disponibles en la orden de mérito. Si el candidato no acepta,
            se debe declarar desierto el concurso.
          </p>
        )
      )}
      {ToastUI}
    </div>
  )
}
