// Panel de la Etapa 4 (IFACS/INSAL) que permite reutilizar un integrante
// disponible de una orden de mérito compatible (mismo puesto + especialidad +
// escalafón). Reservar un integrante lo marca como designado en la OM de
// origen y lo registra como persona designada del concurso — NO finaliza el
// concurso (eso es un paso posterior).
import { useOmCompatibles, useReservarIntegranteOm } from '../hooks/useConcursosCph'
import { useToast } from '@/shared/components/ui/useToast'

export function PanelReutilizarOm({ concursoId }: { concursoId: string }) {
  const { data: compatibles = [], isLoading } = useOmCompatibles(concursoId)
  const reservar = useReservarIntegranteOm(concursoId)
  const { toast, ToastUI } = useToast()

  const hayDisponibles = compatibles.some((o) =>
    o.integrantes.some((i) => !i.designado && !i.anulado),
  )

  if (isLoading || compatibles.length === 0 || !hayDisponibles) return null

  return (
    <div className="rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-4">
      <p className="text-sm font-semibold text-gray-800">Reutilizar orden de mérito</p>
      <p className="mb-3 text-xs text-gray-500">
        Hay órdenes de mérito compatibles con integrantes disponibles. Podés tomar uno para este
        concurso (queda reservado como persona designada; la designación formal es un paso aparte).
      </p>

      <div className="space-y-3">
        {compatibles.map((o) => {
          const disponibles = o.integrantes.filter((i) => !i.designado && !i.anulado)
          if (disponibles.length === 0) return null
          return (
            <div key={o.id} className="rounded border border-gray-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium text-gray-700">
                {o.concursoCph?.concurso?.cargo?.codigo ?? o.puesto ?? 'OM'} · {o.especialidad} ·
                vence {o.fechaVencimiento.slice(0, 10).split('-').reverse().join('/')}
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
                          toast.error(
                            (e as { response?: { data?: { error?: { message?: string } } } })
                              ?.response?.data?.error?.message ??
                              'No se pudo reservar el integrante',
                          )
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
      {ToastUI}
    </div>
  )
}
