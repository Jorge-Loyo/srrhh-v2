import type { Slide11Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { GraficoBarras } from '../components/GraficoBarras'
import { TablaVariacion } from '../components/TablaVariacion'
import { Caja } from '../components/Caja'
import { CajonKpi, ChipKpi, CajaResumen, BadgeBloque, FlechaTendencia } from '../components/kpiPiezas'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 11 — "Dotación Activa · Técnicos de la Salud".
// Misma maquetación por coordenadas que la S10. Gráfico de barras simples con
// línea de tendencia. Activá `?guia` en la URL para la regla de ayuda.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide11Data
  numero: number
}

export function Slide11Tecnicos({ data, numero }: Props) {
  const total = data.bloques[0]
  const jefes = data.bloques[1]

  return (
    <SlideCanvas numero={numero} modo="absoluto">
      {/* Header */}
      <Caja x={40} y={24} w={460}>
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} />
      </Caja>

      {/* ── Bloque "Dotación Total" (sube) ─────────────────────────────────── */}
      <Caja x={48} y={96}>
        <BadgeBloque texto={total.etiqueta ?? ''} tono={total.etiquetaTono ?? 'amarillo'} />
      </Caja>
      <Caja x={48} y={114} w={96}>
        <CajonKpi kpi={total.kpis[0]} />
      </Caja>
      <Caja x={150} y={135} anclaje="cl">
        <FlechaTendencia sentido="sube" />
      </Caja>
      <Caja x={170} y={114} w={96}>
        <CajonKpi kpi={total.kpis[1]} />
      </Caja>
      <Caja x={48} y={160}>
        <div className="flex gap-1.5">
          {total.kpisSecundarios.map((k) => (
            <ChipKpi key={k.label} kpi={k} />
          ))}
        </div>
      </Caja>
      <Caja x={290} y={104} w={78}>
        <CajaResumen kpi={total.kpis[2]} />
      </Caja>
      <Caja x={290} y={142} w={78}>
        <CajaResumen kpi={total.kpis[3]} />
      </Caja>

      {/* ── Bloque "Jefes" (baja) ──────────────────────────────────────────── */}
      <Caja x={48} y={200}>
        <BadgeBloque texto={jefes.etiqueta ?? ''} tono={jefes.etiquetaTono ?? 'rojo'} />
      </Caja>
      <Caja x={48} y={218} w={96}>
        <CajonKpi kpi={jefes.kpis[0]} />
      </Caja>
      <Caja x={150} y={239} anclaje="cl">
        <FlechaTendencia sentido="baja" />
      </Caja>
      <Caja x={170} y={218} w={96}>
        <CajonKpi kpi={jefes.kpis[1]} />
      </Caja>
      <Caja x={48} y={264}>
        <div className="flex gap-1.5">
          {jefes.kpisSecundarios.map((k) => (
            <ChipKpi key={k.label} kpi={k} />
          ))}
        </div>
      </Caja>
      <Caja x={290} y={208} w={78}>
        <CajaResumen kpi={jefes.kpis[2]} />
      </Caja>
      <Caja x={290} y={246} w={78}>
        <CajaResumen kpi={jefes.kpis[3]} />
      </Caja>

      {/* ── Rótulo + gráfico ───────────────────────────────────────────────── */}
      <Caja x={48} y={308}>
        {data.tituloGrafico && (
          <span className="inline-block bg-navy text-white font-bold text-[11px] px-3 py-1 rounded uppercase tracking-wide">
            {data.tituloGrafico}
          </span>
        )}
      </Caja>
      {data.subtituloGrafico && (
        <Caja x={48} y={336}>
          <span className="text-secondary font-bold text-[10px] uppercase tracking-wide">{data.subtituloGrafico}</span>
        </Caja>
      )}
      <Caja x={40} y={356} w={480} h={288}>
        <GraficoBarras data={data.grafico} width={480} height={288} />
      </Caja>

      {/* ── Tabla por efector (derecha) ────────────────────────────────────── */}
      <Caja x={538} y={30} w={700} h={610}>
        <TablaVariacion data={data.tablaEfector} densidad="compacta" />
      </Caja>
    </SlideCanvas>
  )
}
