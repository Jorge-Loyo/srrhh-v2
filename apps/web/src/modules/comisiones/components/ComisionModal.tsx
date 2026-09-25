import { useState } from 'react'
import { useRegistrarComision } from '../hooks/useComisiones'

interface Props {
  ocupacionId: string
  persona: string
  cargo: string
  onClose: () => void
}

// Alta manual de comisión sobre una ocupación activa. El cargo de origen no se
// toca: sigue ocupado y no se genera remplazante.
export function ComisionModal({ ocupacionId, persona, cargo, onClose }: Props) {
  const registrar = useRegistrarComision()
  const [comision, setComision] = useState('')
  const [repaComision, setRepaComision] = useState('')
  const [crComentario, setCrComentario] = useState('')
  const [formError, setFormError] = useState('')

  const puedeEnviar = comision.trim() && repaComision.trim() && !registrar.isPending

  function confirmar() {
    setFormError('')
    registrar.mutate(
      {
        ocupacionId,
        comision: comision.trim(),
        repaComision: repaComision.trim(),
        ...(crComentario.trim() ? { crComentario: crComentario.trim() } : {}),
      },
      {
        onSuccess: onClose,
        onError: (e: any) =>
          setFormError(e?.response?.data?.error?.message ?? e?.message ?? 'No se pudo registrar la comisión.'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h3 className="font-bold text-gray-900">Registrar comisión</h3>
        <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
          <p><span className="text-gray-500">Persona:</span> <span className="font-medium">{persona}</span></p>
          <p><span className="text-gray-500">Cargo de origen:</span> <span className="font-mono font-bold">{cargo}</span></p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Motivo <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={comision}
            maxLength={150}
            onChange={(e) => setComision(e.target.value)}
            className="h-10 input w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Repartición / hospital de destino <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={repaComision}
            maxLength={200}
            onChange={(e) => setRepaComision(e.target.value)}
            className="h-10 input w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Comentario <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            value={crComentario}
            maxLength={2000}
            rows={3}
            onChange={(e) => setCrComentario(e.target.value)}
            className="input w-full py-2"
          />
        </div>
        <p className="text-xs text-gray-400">
          El cargo de origen sigue ocupado. La comisión termina cuando llega desde Meta4 o al finalizarla manualmente.
        </p>
        {formError && (
          <p className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
        )}
        <div className="flex gap-3">
          <button className="btn-outline flex-1" onClick={onClose} disabled={registrar.isPending}>
            Cancelar
          </button>
          <button className="btn-primary flex-1" disabled={!puedeEnviar} onClick={confirmar}>
            {registrar.isPending ? 'Registrando...' : 'Registrar comisión'}
          </button>
        </div>
      </div>
    </div>
  )
}
