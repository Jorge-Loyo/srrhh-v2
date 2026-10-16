import type { Slide09Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { KpiComparativa } from '../components/KpiComparativa'
import { GraficoBarras } from '../components/GraficoBarras'
import { TablaVariacion } from '../components/TablaVariacion'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 9 — "Dotación Activa · Cargos de estructura · CPH · Jefes".
// Izquierda: KPIs + gráfico de barras agrupadas (activos por jefatura).
// Derecha: tabla de variación por efector. Presentacional puro.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide09Data
  numero: number
}

export function Slide09CargosEstructura({ data, numero }: Props) {
  return (
    <SlideCanvas numero={numero}>
      <div className="h-full flex flex-col">
        <SlideHeader
          tag={data.tag}
          titulo={data.titulo}
          subtitulo={data.subtitulo}
          subtitulo2={data.subtitulo2}
          marcaAgua="CPH"
        />

        <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
          {/* Izquierda: KPIs arriba, gráfico abajo */}
          <div className="flex flex-col gap-3 min-h-0">
            <KpiComparativa kpis={data.kpis} kpisSecundarios={data.kpisSecundarios} />

            <div className="flex-1 flex items-center gap-2 min-h-0">
              {data.tituloGrafico && (
                <span
                  className="font-bold italic text-navy text-[11px] whitespace-nowrap shrink-0"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  {data.tituloGrafico}
                </span>
              )}
              <div className="flex-1 min-h-0">
                <GraficoBarras data={data.grafico} width={480} height={280} />
              </div>
            </div>
          </div>

          {/* Derecha: tabla de variación por efector (compacta: 27 filas) */}
          <div className="min-h-0 overflow-hidden">
            <TablaVariacion data={data.tablaEfector} densidad="compacta" />
          </div>
        </div>
      </div>
    </SlideCanvas>
  )
}
