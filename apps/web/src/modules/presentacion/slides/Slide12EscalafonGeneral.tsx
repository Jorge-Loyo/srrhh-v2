import type { Slide12Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { TablaVariacionMulti } from '../components/TablaVariacionMulti'
import { Caja } from '../components/Caja'
import { Cuadrante } from '../components/Cuadrante'
import { BloqueKpiComparativo } from '../components/BloqueKpiComparativo'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 12 — "Dotación Activa · Escalafón General". Layout por cuadrantes:
//   sup-izq → bloques KPI    |  derecha → tabla larga (2 columnas internas)
//   inf-izq → aclaración     |
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide12Data
  numero: number
}

export function Slide12EscalafonGeneral({ data, numero }: Props) {
  return (
    <SlideCanvas numero={numero} modo="absoluto">
      <Caja x={36} y={24} w={1208}>
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} />
      </Caja>

      {/* sup-izq: bloques KPI */}
      <Cuadrante zona="sup-izq" alignV="end" padding={10}>
        <div className="flex flex-col gap-3">
          <BloqueKpiComparativo bloque={data.bloques[0]} />
          <BloqueKpiComparativo bloque={data.bloques[1]} />
        </div>
      </Cuadrante>

      {/* inf-izq: aclaración */}
      {data.aclaracion && (
        <Cuadrante zona="inf-izq" alignV="start" padding={10}>
          <div className="border-l-4 border-navy/30 pl-3">
            <p className="font-bold text-gray-700 text-sm mb-1">{data.aclaracion.titulo}</p>
            {data.aclaracion.lineas.map((l, i) => (
              <p key={i} className="text-secondary text-[12px] leading-snug">
                {l}
              </p>
            ))}
          </div>
        </Cuadrante>
      )}

      {/* Tabla larga en 2 columnas: la grilla de cuadrantes le queda chica (se
          corta la columna %), así que se le da MÁS ancho rompiendo la grilla
          pero a escala — arranca antes del centro y usa casi toda la mitad
          derecha y todo el alto. */}
      <Caja x={520} y={64} w={724} h={600}>
        <div className="flex flex-col w-full h-full">
          <div className="flex-1 min-h-0">
            <TablaVariacionMulti data={data.tablaEfector} columnas={2} densidad="compacta" />
          </div>
          {data.tablaEfector.notaPie && (
            <p className="text-right text-gray-400 italic text-[9px] mt-1">{data.tablaEfector.notaPie}</p>
          )}
        </div>
      </Caja>
    </SlideCanvas>
  )
}
