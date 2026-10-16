import type { Kpi } from '../data/types'
import { fmtNum } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Fila de KPIs comparativos del apartado Dotación (S4, S5, …):
//   [valor base] → [valor actual destacado] → (flecha) → [cajas resumen]
// con chips de meses intermedios debajo. Tema Obelisco.
//
// `kpis`     → cajas grandes de la izquierda (base, actual, …).
// `resumen`  → cajas chicas de la derecha (Cantidad, Porcentaje, …).
// `kpisSecundarios` → chips tenues bajo las cajas grandes (meses intermedios).
// `sentido`  → dirección de la flecha central: 'sube' (↗ verde) / 'baja' (↘ rojo).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  kpis: Kpi[]
  kpisSecundarios: Kpi[]
  /** Cajas-resumen de la derecha. Si se omite, se derivan de kpis con tono 'diferencia'/'negativo'. */
  resumen?: Kpi[]
  /** Dirección de la flecha central. Default 'sube'. */
  sentido?: 'sube' | 'baja'
  /** Etiqueta/badge sobre el bloque (ej: "DOTACIÓN TOTAL"). */
  etiqueta?: string
  /** Tono del badge de etiqueta. */
  etiquetaTono?: 'amarillo' | 'rojo' | 'navy'
}

const BADGE_TONOS: Record<'amarillo' | 'rojo' | 'navy', string> = {
  amarillo: 'bg-primary text-black',
  rojo: 'bg-danger text-white',
  navy: 'bg-navy text-white',
}

// Tonos de caja — compartidos por cajas grandes y de resumen.
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

export function KpiComparativa({
  kpis,
  kpisSecundarios,
  resumen,
  sentido = 'sube',
  etiqueta,
  etiquetaTono = 'navy',
}: Props) {
  // Cajas grandes: las que van a la izquierda. Las de resumen ('diferencia' o
  // 'negativo') van a la derecha, salvo que se pase `resumen` explícito.
  const esResumen = (k: Kpi) => k.tono === 'diferencia' || k.tono === 'negativo'
  const grandes = resumen ? kpis : kpis.filter((k) => !esResumen(k))
  const derecha = resumen ?? kpis.filter(esResumen)

  const flecha = sentido === 'baja' ? '↘' : '↗'
  const flechaColor = sentido === 'baja' ? 'text-danger' : 'text-success'

  return (
    <div>
      {etiqueta && (
        <span
          className={`inline-block mb-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${BADGE_TONOS[etiquetaTono]}`}
        >
          {etiqueta}
        </span>
      )}
      <div className="flex items-start gap-4">
        {/* Columna izquierda: fila de cajones grandes (+ flecha al costado) y,
            debajo, los chips centrados respecto al bloque de cajones grandes
            (sin contar la flecha). */}
        <div className="flex items-start gap-2">
          {/* Bloque de cajones + chips: mide sólo lo que miden los cajones. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {grandes.map((k, i) => (
                <div key={k.label} className="flex items-center gap-3">
                  <KpiBox kpi={k} />
                  {i < grandes.length - 1 && <span className="text-gray-400 font-bold text-lg">⇢</span>}
                </div>
              ))}
            </div>
            {kpisSecundarios.length > 0 && (
              // Chips alineados a la izquierda, arrancando bajo el primer cajón
              // grande (como en las slides originales).
              <div className="flex justify-start gap-2">
                {kpisSecundarios.map((k) => (
                  <div key={k.label} className="bg-gray-100 rounded px-2.5 py-1 text-center min-w-[72px]">
                    <p className="font-bold text-gray-700 text-xs leading-none tabular-nums">
                      {k.displayValue ?? fmtNum(k.value)}
                    </p>
                    <p className="text-gray-400 text-[9px] leading-tight mt-0.5">{k.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Flecha al costado del bloque de cajones, alineada a su altura. */}
          <span className={`font-bold text-2xl mt-2 ${flechaColor}`}>{flecha}</span>
        </div>

        {/* Columna derecha: cajas-resumen */}
        {derecha.length > 0 && (
          <div className="flex flex-col gap-2">
            {derecha.map((k) => {
              const tono = k.tono ?? 'diferencia'
              return (
                <div key={k.label} className={`pres-halo rounded-md px-4 py-1.5 text-center min-w-[88px] ${TONOS[tono]}`}>
                  <p className="font-extrabold text-lg leading-none tabular-nums">{k.displayValue ?? fmtNum(k.value)}</p>
                  <p className={`text-[10px] leading-tight mt-0.5 ${colorLabel(tono)}`}>{k.label}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiBox({ kpi }: { kpi: Kpi }) {
  const tono = kpi.tono ?? 'neutro'
  return (
    <div className={`pres-halo rounded-lg px-4 py-2 text-center min-w-[104px] ${TONOS[tono]}`}>
      <p className="font-extrabold text-2xl leading-none tabular-nums">{kpi.displayValue ?? fmtNum(kpi.value)}</p>
      <p className={`text-[10px] mt-0.5 ${colorLabel(tono)}`}>{kpi.label}</p>
    </div>
  )
}
