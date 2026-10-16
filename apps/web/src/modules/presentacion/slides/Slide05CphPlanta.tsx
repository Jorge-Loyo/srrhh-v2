import type { Slide05Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { KpiComparativa } from '../components/KpiComparativa'
import { TablaVariacion } from '../components/TablaVariacion'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 5 — "Dotación Activa · CPH de Planta".
// Header + KPIs comparativos (reutilizados de la S4) y dos tablas de variación
// (por Efector y por Especialidad). Presentacional puro: data por props.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide05Data
  numero: number
}

export function Slide05CphPlanta({ data, numero }: Props) {
  return (
    <SlideCanvas numero={numero}>
      <div className="h-full flex flex-col">
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} marcaAgua="CPH" />

        <div className="mt-3 mb-5">
          <KpiComparativa kpis={data.kpis} kpisSecundarios={data.kpisSecundarios} />
        </div>

        {/* Dos tablas lado a lado, centradas verticalmente en el espacio libre */}
        <div className="flex-1 grid grid-cols-2 gap-10 min-h-0 items-center">
          <TablaVariacion data={data.tablaEfector} densa />
          <TablaVariacion data={data.tablaEspecialidad} densa />
        </div>
      </div>
    </SlideCanvas>
  )
}
