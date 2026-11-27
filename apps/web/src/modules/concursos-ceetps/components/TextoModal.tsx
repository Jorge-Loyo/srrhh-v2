import { useEffect, useState } from 'react'

// Ventana para escribir, editar o simplemente ver un texto largo (motivo de no
// admisión, resultado de un reclamo…). Los textos largos no se editan dentro de
// la celda de la tabla: se abren acá.

export function TextoModal({
  titulo,
  subtitulo,
  valor,
  soloLectura,
  onGuardar,
  onCerrar,
}: {
  titulo: string
  subtitulo?: string
  valor: string | null
  soloLectura: boolean
  onGuardar: (texto: string | null) => void
  onCerrar: () => void
}) {
  const [texto, setTexto] = useState(valor ?? '')
  useEffect(() => setTexto(valor ?? ''), [valor])
  const cambio = (texto.trim() || null) !== (valor ?? null)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="font-primary font-bold text-gray-900">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}
        </div>
        <div className="px-5 py-4">
          <textarea
            value={texto}
            readOnly={soloLectura}
            autoFocus
            rows={7}
            onChange={(e) => setTexto(e.target.value)}
            className="input w-full py-2 text-sm"
            placeholder={soloLectura ? 'Sin texto cargado.' : 'Escribí acá…'}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" className="btn-outline text-sm" onClick={onCerrar}>
            {soloLectura ? 'Cerrar' : 'Cancelar'}
          </button>
          {!soloLectura && (
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={!cambio}
              onClick={() => {
                onGuardar(texto.trim() || null)
                onCerrar()
              }}
            >
              Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
