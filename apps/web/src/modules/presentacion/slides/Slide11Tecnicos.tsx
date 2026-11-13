import type { Slide11Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { GraficoBarras } from '../components/GraficoBarras'
import { TablaVariacion } from '../components/TablaVariacion'
import { Caja } from '../components/Caja'
import { Cuadrante } from '../components/Cuadrante'
import { BloqueKpiComparativo } from '../components/BloqueKpiComparativo'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 11 — "Dotación Activa · Técnicos de la Salud".
//
// Layout por CUADRANTES (ver Cuadrante.tsx): header full-width arriba, y el
// cuerpo repartido en zonas con margen propio, de modo que nada se solape:
//   sup-izq → bloques KPI    |  derecha → tabla por efector (alto completo)
//   inf-izq → gráfico        |
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide11Data
  numero: number
}

export function Slide11Tecnicos({ data, numero }: Props) {
  return (
    <SlideCanvas numero={numero} modo="absoluto">
      {/* Header full-width (título izq + tag der) */}
      <Caja x={36} y={24} w={1208}>
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} />
      </Caja>

      {/* sup-izq: bloques KPI (debajo del header) */}
      <Cuadrante zona="sup-izq" alignV="end" padding={10}>
        <div className="flex flex-col gap-3">
          <BloqueKpiComparativo bloque={data.bloques[0]} />
          <BloqueKpiComparativo bloque={data.bloques[1]} />
        </div>
      </Cuadrante>

      {/* inf-izq: gráfico */}
      <Cuadrante zona="inf-izq" alignH="start" alignV="start" padding={10}>
        <div className="flex flex-col w-full h-full">
          {(data.tituloGrafico || data.subtituloGrafico) && (
            <div className="mb-1 flex items-center gap-2">
              {data.tituloGrafico && (
                <span className="pres-banda pres-banda-navy inline-block text-white font-bold text-[11px] pl-4 pr-3 py-1 uppercase tracking-wide">
                  {data.tituloGrafico}
                </span>
              )}
              {data.subtituloGrafico && (
                <span className="text-secondary font-bold text-[10px] uppercase tracking-wide">
                  {data.subtituloGrafico}
                </span>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <GraficoBarras data={data.grafico} width={540} height={280} />
          </div>
        </div>
      </Cuadrante>

      {/* derecha: tabla por efector (alto completo; pt deja lugar al tag) */}
      <Cuadrante zona="derecha" padding={8} pt={44}>
        <TablaVariacion data={data.tablaEfector} densidad="compacta" />
      </Cuadrante>
    </SlideCanvas>
  )
}
