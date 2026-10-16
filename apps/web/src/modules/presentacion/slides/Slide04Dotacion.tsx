import type { Slide04Data, TarjetaResumen } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { KpiComparativa } from '../components/KpiComparativa'
import { TablaVariacion } from '../components/TablaVariacion'
import { fmtNum, fmtPct } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 4 — "Dotación Activa · Vista General" (Por Escalafón, Estado y Universo).
//
// Componente presentacional: toda la data entra por props (Slide04Data). No sabe
// de dónde viene — hoy un mock, mañana el endpoint del sistema main.
// Estética: tema Obelisco (navy / secondary / primary / success / danger).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide04Data
  numero: number
}

export function Slide04Dotacion({ data, numero }: Props) {
  return (
    <SlideCanvas numero={numero}>
      <div className="h-full flex flex-col">
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} />

        {/* ── Cuerpo: dos columnas ────────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-2 gap-8 min-h-0 mt-2">
          {/* Columna izquierda: KPIs / tabla estado / tarjetas / CTA,
              repartidos uniformemente para llenar el alto sin huecos */}
          <div className="flex flex-col justify-between min-h-0 py-1">
            <KpiComparativa kpis={data.kpis} kpisSecundarios={data.kpisSecundarios} />
            <TablaVariacion data={data.tablaEstado} />
            <div className="grid grid-cols-2 gap-3">
              {data.tarjetas.map((t) => (
                <TarjetaUniverso key={t.etiqueta} tarjeta={t} />
              ))}
            </div>
            {data.ctaFooter && (
              <button
                type="button"
                className="pres-halo bg-primary text-black font-bold text-[11px] px-3 py-1.5 rounded uppercase tracking-wide inline-flex items-center gap-1 self-start hover:bg-primary-dark transition-colors"
              >
                Click para ver {data.ctaFooter} <span aria-hidden>↗</span>
              </button>
            )}
          </div>

          {/* Columna derecha: dos tablas compactas (23 filas juntas) */}
          <div className="flex flex-col gap-4 min-h-0">
            <TablaVariacion data={data.tablaEscalafon} densidad="compacta" />
            <TablaVariacion data={data.tablaUniverso} densidad="compacta" />
          </div>
        </div>
      </div>
    </SlideCanvas>
  )
}

// ── Tarjeta-resumen por universo ──────────────────────────────────────────────
function TarjetaUniverso({ tarjeta }: { tarjeta: TarjetaResumen }) {
  const estilos: Record<NonNullable<TarjetaResumen['tono']>, string> = {
    oscuro: 'bg-navy text-white',
    claro: 'bg-gray-200 text-gray-800',
    acento: 'bg-secondary text-white',
  }
  const tono = tarjeta.tono ?? 'claro'
  const esOscuro = tono === 'oscuro' || tono === 'acento'
  return (
    <div className={`pres-halo rounded-lg px-3 py-2 flex items-center justify-between ${estilos[tono]}`}>
      <div>
        <p className={`text-[10px] font-semibold uppercase leading-tight ${esOscuro ? 'text-white/70' : 'text-gray-500'}`}>
          {tarjeta.etiqueta}
        </p>
        <p className="font-primary font-extrabold text-lg leading-none tabular-nums">{fmtNum(tarjeta.value)}</p>
      </div>
      {tarjeta.participacionPct !== null && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            esOscuro ? 'bg-white/15 text-white' : 'bg-navy/10 text-navy'
          }`}
        >
          {fmtPct(tarjeta.participacionPct).replace(',00', '')}
        </span>
      )}
    </div>
  )
}
