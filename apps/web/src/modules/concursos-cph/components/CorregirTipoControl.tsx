// Paso 5a — botón "Corregir tipo" + modal de confirmación (compartido por los
// wizards CPH y CEETPS). Solo se renderiza si el padre ya verificó
// puedeCorregirTipo(); el backend vuelve a validar (403 / 409).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { getApiErrorMessage } from '@/shared/lib/utils'
import {
  CR_OPCIONES_CEETPS,
  LABEL_TIPO_CONCURSO,
  avisoCorreccionExitosa,
  codigoRegistroPreseleccionado,
  requiereCodigoRegistro,
  rutaConcurso,
  textoConfirmacionCambio,
  tipoDestinoDe,
  type TipoConcursoUi,
} from '../lib/corregirTipo'

interface Props {
  tipoActual: TipoConcursoUi
  /** Id de ConcursoCph / ConcursoCeetps (el de la ruta). */
  detalleId: string
  /** Puestos del cargo (literal / solicitado) para preseleccionar el código de registro. */
  puestos?: (string | null | undefined)[]
  /** Expediente + IF cargados: si es false la corrección NO autoriza. */
  etapa1Completa: boolean
}

export function CorregirTipoControl({ tipoActual, detalleId, puestos = [], etapa1Completa }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [codigoRegistro, setCodigoRegistro] = useState<string>('85')
  const destino = tipoDestinoDe(tipoActual)

  const mutation = useMutation({
    mutationFn: () =>
      apiClient
        .post<{ data: { tipoDestino: TipoConcursoUi; detalleId: string; autorizado: boolean } }>(
          `/api/v1/concursos-${tipoActual}/${detalleId}/corregir-tipo`,
          {
            tipoDestino: destino,
            motivo: motivo.trim(),
            ...(requiereCodigoRegistro(destino) && { codigoRegistro }),
          },
        )
        .then((r) => r.data.data),
    onSuccess: (r) => {
      queryClient.invalidateQueries()
      setAbierto(false)
      navigate(rutaConcurso(r.tipoDestino, r.detalleId), {
        replace: true,
        state: { avisoTipo: avisoCorreccionExitosa(r.tipoDestino, r.autorizado) },
      })
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  return (
    <>
      <button
        type="button"
        className="btn-outline text-xs py-1 px-3"
        onClick={() => {
          setMotivo('')
          setError('')
          setCodigoRegistro(codigoRegistroPreseleccionado(...puestos))
          setAbierto(true)
        }}
      >
        Corregir tipo
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="corregir-tipo-titulo">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 id="corregir-tipo-titulo" className="font-primary font-bold text-gray-900">
                Corregir tipo de concurso
              </h3>
              <p className="text-sm text-gray-700 mt-1 font-semibold">{textoConfirmacionCambio(tipoActual, etapa1Completa)}</p>
              <p className="text-xs text-gray-500 mt-1">
                Se crea el concurso {LABEL_TIPO_CONCURSO[destino]} con los datos ya cargados y se elimina el actual. Si
                había una autorización pendiente, se cierra con el motivo del cambio.{' '}
                {etapa1Completa
                  ? 'Como el expediente y el IF ya están cargados, se autoriza en este mismo acto.'
                  : 'Falta cargar el expediente y/o el IF: el concurso se corrige pero NO se autoriza.'}
              </p>
            </div>
            <div className="px-6 py-4 space-y-2">
              <label htmlFor="corregir-tipo-motivo" className="block text-sm font-semibold text-gray-700">
                Motivo <span className="font-normal text-gray-500">(obligatorio)</span>
              </label>
              <textarea
                id="corregir-tipo-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                className="input w-full py-2"
                placeholder="Por qué se corrige el tipo..."
              />
              {requiereCodigoRegistro(destino) && (
                <div className="space-y-1 pt-2">
                  <label htmlFor="corregir-tipo-cr" className="block text-sm font-semibold text-gray-700">
                    Código de registro <span className="font-normal text-gray-500">(obligatorio)</span>
                  </label>
                  <select
                    id="corregir-tipo-cr"
                    value={codigoRegistro}
                    onChange={(e) => setCodigoRegistro(e.target.value)}
                    className="input w-full py-2"
                  >
                    {CR_OPCIONES_CEETPS.map((o) => (
                      <option key={o.codigo} value={o.codigo}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" className="btn-outline" onClick={() => setAbierto(false)} disabled={mutation.isPending}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={mutation.isPending || !motivo.trim()}
                title={!motivo.trim() ? 'Indicá el motivo' : undefined}
                onClick={() => {
                  setError('')
                  mutation.mutate()
                }}
              >
                {mutation.isPending ? 'Corrigiendo…' : `Pasar a ${LABEL_TIPO_CONCURSO[destino]}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
