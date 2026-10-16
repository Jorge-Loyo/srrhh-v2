import type { Slide07Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { KpiComparativa } from '../components/KpiComparativa'
import { TablaColumnas } from '../components/TablaColumnas'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 7 — "Dotación Activa · CPH de Guardia · Por Efector y Tipo".
// Header (3 renglones) + rótulo en banda + KPIs + dos tablas genéricas por
// columnas (subcolumnas Cargos/Activos por mes, con Cargos intermedios ocultos).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide07Data
  numero: number
}

export function Slide07CphGuardiaEfector({ data, numero }: Props) {
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

        <div className="flex items-start gap-4 mb-3">
          <KpiComparativa kpis={data.kpis} kpisSecundarios={data.kpisSecundarios} />
        </div>

        {data.rotulo && (
          <div className="mb-2">
            <span className="inline-block bg-navy text-white font-bold text-xs px-3 py-1 rounded uppercase tracking-wide">
              {data.rotulo}
            </span>
          </div>
        )}

        <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
          <TablaColumnas data={data.tablaCrecimiento} densa />
          <TablaColumnas data={data.tablaDecrecimiento} densa />
        </div>
      </div>
    </SlideCanvas>
  )
}
