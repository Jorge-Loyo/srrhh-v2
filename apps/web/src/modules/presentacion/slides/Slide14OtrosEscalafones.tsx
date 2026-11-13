import type { Slide14Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { GraficoBarras } from '../components/GraficoBarras'
import { Caja } from '../components/Caja'
import { Cuadrante } from '../components/Cuadrante'
import { BloqueKpiComparativo } from '../components/BloqueKpiComparativo'
import { FilaEscalafon } from '../components/FilaEscalafon'
import { etiquetaMesAnio, mesInicio, mesFin } from '../data/periodo'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 14 — "Dotación Activa · Otros escalafones". Layout por cuadrantes:
//   izquierda → KPI principal + 3 filas de escalafón
//   sup-der   → aclaración   |  inf-der → gráfico "Abril"
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide14Data
  numero: number
}

export function Slide14OtrosEscalafones({ data, numero }: Props) {
  const labelIni = etiquetaMesAnio(mesInicio(data.periodo), data.periodo)
  const labelFin = etiquetaMesAnio(mesFin(data.periodo), data.periodo)

  return (
    <SlideCanvas numero={numero} modo="absoluto">
      <Caja x={36} y={24} w={1208}>
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} />
      </Caja>

      {/* izquierda: KPI principal + 3 filas de escalafón */}
      <Cuadrante zona="izquierda" padding={10} pt={78}>
        <div className="flex flex-col w-full h-full gap-3">
          <BloqueKpiComparativo bloque={data.bloque} />
          <div className="flex flex-col gap-2.5 mt-1">
            {data.filas.map((f) => (
              <FilaEscalafon key={f.rotulo} fila={f} labelInicio={labelIni} labelFin={labelFin} />
            ))}
          </div>
        </div>
      </Cuadrante>

      {/* derecha (columna completa): título + aclaración arriba, y el gráfico
          ocupa TODO el espacio restante hacia abajo (gana el hueco del medio) */}
      <Cuadrante zona="derecha" padding={10} pt={44}>
        <div className="flex flex-col w-full h-full">
          {data.tituloGrafico && <p className="text-navy font-bold text-2xl mb-2">{data.tituloGrafico}</p>}
          {data.aclaracion && (
            <div className="text-gray-500 mb-2">
              <p className="font-bold text-gray-700 text-sm mb-0.5">{data.aclaracion.titulo}</p>
              {data.aclaracion.lineas.map((l, i) => (
                <p key={i} className="text-[12px] leading-snug">
                  {l}
                </p>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <GraficoBarras data={data.grafico} width={560} height={360} />
          </div>
        </div>
      </Cuadrante>
    </SlideCanvas>
  )
}
