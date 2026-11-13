import type { Slide13Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { GraficoTorta } from '../components/GraficoTorta'
import { TablaVariacion } from '../components/TablaVariacion'
import { Caja } from '../components/Caja'
import { Cuadrante } from '../components/Cuadrante'
import { BloqueKpiComparativo } from '../components/BloqueKpiComparativo'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 13 — "Dotación Activa · Residentes". Layout por cuadrantes:
//   sup-izq → bloque KPI (sin badge)  |  derecha → tabla por efector
//   inf-izq → gráfico de torta        |
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide13Data
  numero: number
}

export function Slide13Residentes({ data, numero }: Props) {
  return (
    <SlideCanvas numero={numero} modo="absoluto">
      <Caja x={36} y={24} w={1208}>
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} />
      </Caja>

      {/* izquierda (columna completa): KPI arriba y torta debajo, arrancando
          justo bajo el título (pt deja lugar al header) para no dejar hueco */}
      <Cuadrante zona="izquierda" padding={10} pt={78}>
        <div className="flex flex-col w-full h-full gap-4">
          <BloqueKpiComparativo bloque={data.bloque} />
          <div className="flex-1 min-h-0">
            <GraficoTorta data={data.torta} width={520} height={360} />
          </div>
        </div>
      </Cuadrante>

      {/* derecha: tabla por efector */}
      <Cuadrante zona="derecha" padding={8} pt={44}>
        <TablaVariacion data={data.tablaEfector} densidad="compacta" />
      </Cuadrante>
    </SlideCanvas>
  )
}
