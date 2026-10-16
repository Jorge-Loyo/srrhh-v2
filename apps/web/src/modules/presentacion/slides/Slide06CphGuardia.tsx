import type { Slide06Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { KpiComparativa } from '../components/KpiComparativa'
import { TablaVariacion } from '../components/TablaVariacion'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 6 — "Dotación Activa · CPH de Guardia · Jefes incluidos".
// Header (con tercer renglón) + KPIs comparativos + dos tablas de variación con
// columna fija "Cargos" (crecimiento / decrecimiento). Presentacional puro.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide06Data
  numero: number
}

export function Slide06CphGuardia({ data, numero }: Props) {
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

        <div className="mb-3">
          <KpiComparativa kpis={data.kpis} kpisSecundarios={data.kpisSecundarios} />
        </div>

        {/* Dos tablas lado a lado. La de decrecimiento tiene más filas → densa. */}
        <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
          <TablaVariacion data={data.tablaCrecimiento} densa />
          <TablaVariacion data={data.tablaDecrecimiento} densa />
        </div>
      </div>
    </SlideCanvas>
  )
}
