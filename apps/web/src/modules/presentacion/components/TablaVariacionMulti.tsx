import type { TablaVariacion as TablaVariacionData } from '../data/types'
import { TablaVariacion } from './TablaVariacion'

// ─────────────────────────────────────────────────────────────────────────────
// Tabla de variación MUY LARGA repartida en N columnas lado a lado, para que
// entre completa sin cortarse (ej: S12, 39 filas). Divide las filas de `data`
// en `columnas` tandas y renderiza una TablaVariacion por tanda; sólo la primera
// muestra el título lateral vertical y el subtítulo (las demás van sin rótulo).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: TablaVariacionData
  /** Cantidad de columnas internas. Default 2. */
  columnas?: number
  densidad?: 'normal' | 'densa' | 'compacta'
}

function partir<T>(arr: T[], n: number): T[][] {
  const porCol = Math.ceil(arr.length / n)
  const out: T[][] = []
  for (let i = 0; i < n; i++) out.push(arr.slice(i * porCol, (i + 1) * porCol))
  return out.filter((c) => c.length > 0)
}

export function TablaVariacionMulti({ data, columnas = 2, densidad = 'compacta' }: Props) {
  const tandas = partir(data.filas, columnas)

  return (
    <div className="flex items-start gap-2 min-w-0">
      {tandas.map((filas, i) => {
        const esPrimera = i === 0
        const esUltima = i === tandas.length - 1
        return (
          <div key={i} className="flex-1 min-w-0 flex flex-col">
            {/* Indicador de que esta columna viene de la anterior */}
            {!esPrimera && (
              <p className="text-secondary text-[9px] font-bold italic mb-0.5 pl-5">◂ continuación</p>
            )}
            <TablaVariacion
              data={{
                ...data,
                // Sólo la primera columna lleva título/subtítulo; las demás, limpias.
                titulo: esPrimera ? data.titulo : '',
                subtitulo: esPrimera ? data.subtitulo : undefined,
                notaPie: undefined, // la nota va aparte, una sola vez
                filas,
              }}
              densidad={densidad}
            />
            {/* Indicador de que la tabla continúa en la columna siguiente */}
            {!esUltima && (
              <p className="text-secondary text-[9px] font-bold italic mt-0.5 text-right pr-1">continúa ▸</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
