import { useState } from 'react'
import type { VencimientoCargo } from '@srrhh/types'
import { useRenovarPeriodo } from '../hooks/useVencimientos'

interface Props {
  cargo: VencimientoCargo
  onClose: () => void
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Suma n días / años a una fecha ISO (YYYY-MM-DD) sin problemas de zona horaria.
function sumar(iso: string, { dias = 0, anios = 0 }: { dias?: number; anios?: number }) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const f = new Date(Date.UTC(y + anios, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}

// Renovación del período de un cargo TTR. La fecha propuesta es
// (período actual + 4 años, el ciclo de conducción) pero es editable: el
// backend solo exige que sea posterior a la actual.
export function RenovarPeriodoModal({ cargo, onClose }: Props) {
  const renovar = useRenovarPeriodo()
  const actual = cargo.periodoHasta.slice(0, 10)
  const minimo = sumar(actual, { dias: 1 })

  const [periodoHasta, setPeriodoHasta] = useState(sumar(actual, { anios: 4 }))
  const [docRespaldo, setDocRespaldo] = useState('')
  const [formError, setFormError] = useState('')

  const fechaValida = periodoHasta >= minimo
  const puedeEnviar = fechaValida && docRespaldo.trim().length > 0 && !renovar.isPending

  function confirmar() {
    setFormError('')
    renovar.mutate(
      { cargoId: cargo.id, periodoHasta, docRespaldo: docRespaldo.trim() },
      {
        onSuccess: onClose,
        onError: (e: any) =>
          setFormError(e?.response?.data?.error?.message ?? e?.message ?? 'No se pudo renovar el período.'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h3 className="font-bold text-gray-900">Renovar período</h3>
        <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
          <p><span className="text-gray-500">Cargo:</span> <span className="font-mono font-bold">{cargo.codigo ?? '—'}</span></p>
          <p><span className="text-gray-500">Puesto:</span> {cargo.literalPuesto ?? '—'}</p>
          <p><span className="text-gray-500">Hospital:</span> {cargo.hospitalSigla}</p>
          {cargo.ocupanteNombre && (
            <p><span className="text-gray-500">Ocupante:</span> <span className="font-medium">{cargo.ocupanteNombre}</span></p>
          )}
          <p>
            <span className="text-gray-500">Período actual hasta:</span>{' '}
            <span className="font-medium">{fmtFecha(actual)}</span>
            {cargo.diasRestantes <= 0 && <span className="ml-1.5 text-xs text-red-600">(vencido)</span>}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Nuevo período hasta <span className="text-danger">*</span>
          </label>
          <input
            type="date"
            value={periodoHasta}
            min={minimo}
            onChange={(e) => setPeriodoHasta(e.target.value)}
            className="h-10 input w-full"
          />
          <p className="text-xs text-gray-400 mt-1">
            Sugerida: 4 años sobre el período actual (ciclo de conducción). Podés editarla; debe ser posterior al
            {' '}{fmtFecha(actual)}.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Documento de respaldo <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={docRespaldo}
            onChange={(e) => setDocRespaldo(e.target.value)}
            placeholder="Ej: EX-2026-1234-GCABA-DGAYDRH"
            className="h-10 input w-full"
          />
        </div>

        {formError && (
          <p className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
        )}
        <div className="flex gap-3">
          <button className="btn-outline flex-1" onClick={onClose} disabled={renovar.isPending}>
            Cancelar
          </button>
          <button className="btn-primary flex-1" disabled={!puedeEnviar} onClick={confirmar}>
            {renovar.isPending ? 'Renovando...' : 'Renovar'}
          </button>
        </div>
      </div>
    </div>
  )
}
