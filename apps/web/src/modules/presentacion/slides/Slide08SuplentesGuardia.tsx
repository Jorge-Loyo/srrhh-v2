import type { Slide08Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { KpiComparativa } from '../components/KpiComparativa'
import { GraficoBarras } from '../components/GraficoBarras'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 8 — "Dotación Activa · Suplentes de Guardia".
// Izquierda: dos bloques de KPIs comparativos (crecimiento / decrecimiento).
// Derecha: gráfico de barras (suplentes por mes). Presentacional puro.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide08Data
  numero: number
}

export function Slide08SuplentesGuardia({ data, numero }: Props) {
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

        <div className="flex-1 grid grid-cols-2 gap-8 min-h-0 mt-4 items-start">
          {/* Izquierda: bloques de KPIs apilados cerca del título */}
          <div className="flex flex-col gap-6 pt-2">
            {data.bloques.map((b, i) => (
              <KpiComparativa
                key={i}
                kpis={b.kpis}
                kpisSecundarios={b.kpisSecundarios}
                sentido={b.sentido}
              />
            ))}
          </div>

          {/* Derecha: gráfico de barras, ocupa toda su columna */}
          <div className="h-full min-h-0 flex items-center">
            <GraficoBarras data={data.grafico} width={520} height={340} />
          </div>
        </div>
      </div>
    </SlideCanvas>
  )
}
