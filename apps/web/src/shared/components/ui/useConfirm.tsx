import { useCallback, useState } from 'react'

interface ConfirmOptions {
  titulo?: string
  mensaje: string
  confirmLabel?: string
  cancelLabel?: string
  peligro?: boolean // botón de confirmar en rojo (acciones destructivas)
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

/**
 * Reemplazo de window.confirm() con un modal propio del diseño del sistema.
 * Uso:
 *   const { confirm, ConfirmUI } = useConfirm();
 *   ...
 *   if (await confirm({ mensaje: "¿Seguro?" })) hacerAlgo();
 *   ...
 *   return (<>{ConfirmUI}...</>)
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const cerrar = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const ConfirmUI = pending ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-primary font-bold text-gray-900">{pending.titulo ?? 'Confirmar'}</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 whitespace-pre-line">{pending.mensaje}</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => cerrar(false)}>
            {pending.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            className={pending.peligro ? 'btn-danger' : 'btn-primary'}
            onClick={() => cerrar(true)}
            autoFocus
          >
            {pending.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, ConfirmUI }
}
