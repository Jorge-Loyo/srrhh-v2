import type { FilaEscalafon as FilaEscalafonData } from '../data/types'
import { fmtNum } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Fila de "escalafón" (S14): banda con rótulo arriba y, debajo, tres cajones
// (Cargos · inicio · fin) con una flecha entre inicio y fin. Flujo interno, sin
// coordenadas sueltas → no se solapa. Tema Obelisco.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  fila: FilaEscalafonData
  /** Etiquetas de los cajones inicio/fin (ej: "Enero '26" / "Abril '26"). */
  labelInicio: string
  labelFin: string
}

const BANDA: Record<FilaEscalafonData['rotuloTono'], string> = {
  naranja: 'pres-banda pres-banda-naranja',
  rojo: 'pres-banda pres-banda-rojo',
  verde: 'pres-banda pres-banda-verde',
  navy: 'pres-banda pres-banda-navy',
}

const CAJON_FIN: Record<FilaEscalafonData['finTono'], string> = {
  rosa: 'bg-danger/30 text-gray-800',
  rojo: 'bg-danger text-white',
  verde: 'bg-success/20 text-success',
  neutro: 'bg-gray-100 text-gray-800',
}

export function FilaEscalafon({ fila, labelInicio, labelFin }: Props) {
  return (
    <div className="w-full">
      {/* Banda del rótulo */}
      <div className={`${BANDA[fila.rotuloTono]} pl-4 pr-3 py-1.5 mb-1.5`}>
        <span className="text-[11px] font-bold uppercase tracking-wide">{fila.rotulo}</span>
      </div>

      {/* Tres cajones */}
      <div className="flex items-center gap-2">
        <CajonEsc valor={fila.cargos} label="Cargos" clase="bg-navy text-white" />
        <span className="text-gray-400 text-xs">⋯</span>
        <CajonEsc valor={fila.inicio} label={labelInicio} clase="bg-gray-600 text-white" />
        <span className="text-danger font-bold">→</span>
        <CajonEsc valor={fila.fin} label={labelFin} clase={CAJON_FIN[fila.finTono]} />
      </div>
    </div>
  )
}

function CajonEsc({ valor, label, clase }: { valor: number | null; label: string; clase: string }) {
  const labelColor = clase.includes('text-white') ? 'text-white/70' : clase.includes('text-success') ? 'text-success/80' : 'text-gray-500'
  return (
    <div className={`pres-halo rounded-md px-3 py-1.5 text-center min-w-[88px] ${clase}`}>
      <p className="font-extrabold text-lg leading-none tabular-nums">{fmtNum(valor)}</p>
      <p className={`text-[9px] mt-0.5 ${labelColor}`}>{label}</p>
    </div>
  )
}
