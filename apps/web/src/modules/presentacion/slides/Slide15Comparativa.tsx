import type { Slide15Data } from '../data/types'
import { SlideCanvas } from '../components/SlideCanvas'
import { SlideHeader } from '../components/SlideHeader'
import { GraficoBarras } from '../components/GraficoBarras'
import { TablaColumnas } from '../components/TablaColumnas'
import { Caja } from '../components/Caja'
import { Cuadrante } from '../components/Cuadrante'
import { CajonKpi, ChipKpi, CajaResumen, FlechaTendencia } from '../components/kpiPiezas'

// ─────────────────────────────────────────────────────────────────────────────
// Slide 15 — "Comparativa de Cuatrimestres" (slide especial). Cuadrantes:
//   sup-izq → KPIs comparativos (chip contexto + cajones + resumen destacado)
//   inf-izq → tabla comparativa por escalafón
//   derecha → gráfico de barras agrupadas (1° vs 2° cuatrimestre)
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: Slide15Data
  numero: number
}

export function Slide15Comparativa({ data, numero }: Props) {
  const [inicio, fin, ...resumen] = data.kpis

  return (
    <SlideCanvas numero={numero} modo="absoluto">
      <Caja x={36} y={24} w={1208}>
        <SlideHeader tag={data.tag} titulo={data.titulo} subtitulo={data.subtitulo} />
      </Caja>

      {/* sup-izq: KPIs comparativos (pegados al título, sin hueco arriba) */}
      <Cuadrante zona="sup-izq" alignV="start" padding={10} pt={78}>
        <div className="flex flex-col gap-2">
          {/* Chip de contexto + resumen destacado, arriba */}
          <div className="flex items-start gap-3">
            {data.chipContexto && (
              <div className="bg-gray-100 rounded px-3 py-1.5 text-center">
                <p className="font-extrabold text-gray-700 text-sm leading-none">{data.chipContexto.valor}</p>
                <p className="text-gray-400 text-[8px] leading-tight mt-0.5 uppercase max-w-[120px]">
                  {data.chipContexto.label}
                </p>
              </div>
            )}
            {data.resumenDestacado && (
              <div className="pres-halo bg-danger text-white rounded-md px-3 py-1.5 text-center">
                <p className="font-extrabold text-base leading-none tabular-nums">
                  {data.resumenDestacado.displayValue ?? ''}
                </p>
                <p className="text-white/70 text-[9px] leading-tight mt-0.5">{data.resumenDestacado.label}</p>
              </div>
            )}
          </div>

          {/* Fila principal: inicio → fin + resumen */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <CajonKpi kpi={inicio} />
                <FlechaTendencia sentido="baja" />
                <CajonKpi kpi={fin} />
              </div>
              {data.kpisSecundarios.length > 0 && (
                <div className="flex gap-1.5">
                  {data.kpisSecundarios.map((k) => (
                    <ChipKpi key={k.label} kpi={k} />
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {resumen.map((k) => (
                <CajaResumen key={k.label} kpi={k} />
              ))}
            </div>
          </div>
        </div>
      </Cuadrante>

      {/* Tabla comparativa (mitad inferior izquierda, acotada para no chocar
          con el gráfico que gana ancho hacia la izquierda). */}
      <Caja x={40} y={372} w={500} h={300}>
        <TablaColumnas data={data.tablaComparativa} densa />
      </Caja>

      {/* Gráfico: gana ancho hacia la izquierda (arranca pasando apenas el
          centro, sin pisar la tabla) y usa casi todo el alto, más proporcionado. */}
      <Caja x={560} y={96} w={684} h={556}>
        <GraficoBarras data={data.grafico} width={684} height={556} />
      </Caja>
    </SlideCanvas>
  )
}
