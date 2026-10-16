import type { Kpi } from '../data/types'
import { fmtNum } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Piezas atómicas de KPI, para componer slides por COORDENADAS (con <Caja>)
// cuando se necesita fidelidad pixel a pixel con la slide original. Son las
// mismas cajas que usa KpiComparativa, pero sueltas para ubicarlas una por una.
// ─────────────────────────────────────────────────────────────────────────────

const TONOS: Record<NonNullable<Kpi['tono']>, string> = {
  neutro: 'bg-gray-100 text-gray-800',
  base: 'bg-navy text-white',
  baseGris: 'bg-gray-600 text-white',
  destacado: 'bg-success/15 text-success border border-success/30',
  negativo: 'bg-danger text-white',
  diferencia: 'bg-surface text-gray-800',
}

function colorLabel(tono: NonNullable<Kpi['tono']>): string {
  if (tono === 'destacado') return 'text-success/80'
  if (tono === 'base' || tono === 'baseGris' || tono === 'negativo') return 'text-white/70'
  return 'text-gray-500'
}

/** Cajón grande (valor principal). */
export function CajonKpi({ kpi }: { kpi: Kpi }) {
  const tono = kpi.tono ?? 'neutro'
  return (
    <div className={`pres-halo rounded-lg px-3 py-1.5 text-center ${TONOS[tono]}`}>
      <p className="font-extrabold text-xl leading-none tabular-nums">{kpi.displayValue ?? fmtNum(kpi.value)}</p>
      <p className={`text-[9px] mt-0.5 ${colorLabel(tono)}`}>{kpi.label}</p>
    </div>
  )
}

/** Chip chico (mes intermedio / COMPLETAR). */
export function ChipKpi({ kpi }: { kpi: Kpi }) {
  return (
    <div className="bg-gray-100 rounded px-2 py-0.5 text-center">
      <p className="font-bold text-gray-700 text-[11px] leading-none tabular-nums">
        {kpi.displayValue ?? fmtNum(kpi.value)}
      </p>
      <p className="text-gray-400 text-[8px] leading-tight mt-0.5">{kpi.label}</p>
    </div>
  )
}

/** Caja-resumen (Cantidad / Porcentaje). */
export function CajaResumen({ kpi }: { kpi: Kpi }) {
  const tono = kpi.tono ?? 'diferencia'
  return (
    <div className={`pres-halo rounded-md px-3 py-1.5 text-center ${TONOS[tono]}`}>
      <p className="font-extrabold text-base leading-none tabular-nums">{kpi.displayValue ?? fmtNum(kpi.value)}</p>
      <p className={`text-[9px] leading-tight mt-0.5 ${colorLabel(tono)}`}>{kpi.label}</p>
    </div>
  )
}

/** Badge de etiqueta del bloque ("DOTACIÓN TOTAL", "JEFES"). */
export function BadgeBloque({ texto, tono }: { texto: string; tono: 'amarillo' | 'rojo' | 'navy' }) {
  const estilos = { amarillo: 'bg-primary text-black', rojo: 'bg-danger text-white', navy: 'bg-navy text-white' }
  return (
    <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded ${estilos[tono]}`}>
      {texto}
    </span>
  )
}

/** Flecha de tendencia. */
export function FlechaTendencia({ sentido }: { sentido: 'sube' | 'baja' }) {
  return (
    <span className={`font-bold text-2xl ${sentido === 'baja' ? 'text-danger' : 'text-success'}`}>
      {sentido === 'baja' ? '↘' : '↗'}
    </span>
  )
}
