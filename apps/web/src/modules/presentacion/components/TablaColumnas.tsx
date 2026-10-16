import type { TablaColumnas as TablaColumnasData, ColumnaDef, FilaColumnas } from '../data/types'
import { fmtNum, fmtPct, colorSigno } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Tabla genérica por columnas. Columnas declaradas explícitamente; cada fila es
// un mapa clave→valor. Soporta:
//  · columnas OCULTAS (col.oculta) — el dato permanece en la fila, no se pinta.
//  · encabezado de 2 niveles — columnas visibles consecutivas con el mismo
//    `grupo` se agrupan bajo un header que las abarca (ej: "Enero" → Cargos/Activos).
//  · formato por tipo (texto / número / porcentaje con color por signo).
// Mismo encuadre Obelisco que TablaVariacion (box + zebra). Tipografía Montserrat
// heredada del contenedor .presentacion.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: TablaColumnasData
  /** Compacta el padding para tablas con muchas filas. */
  densa?: boolean
}

/** Tramos de grupo para el encabezado superior: cada grupo con su colSpan. */
function tramosDeGrupo(columnas: ColumnaDef[]): { grupo: string; span: number }[] {
  const tramos: { grupo: string; span: number }[] = []
  for (const col of columnas) {
    const g = col.grupo ?? ''
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && ultimo.grupo === g) ultimo.span += 1
    else tramos.push({ grupo: g, span: 1 })
  }
  return tramos
}

function alineacion(col: ColumnaDef): string {
  return (col.formato ?? 'numero') === 'texto' ? 'text-left' : 'text-right'
}

function renderValor(col: ColumnaDef, fila: FilaColumnas) {
  const v = fila[col.clave]
  const formato = col.formato ?? 'numero'
  if (formato === 'texto') return v == null ? '' : String(v)
  if (formato === 'porcentaje') return fmtPct(typeof v === 'number' ? v : null, col.decimalesPct ?? 2)
  return fmtNum(typeof v === 'number' ? v : null)
}

export function TablaColumnas({ data, densa = false }: Props) {
  const padY = densa ? 'py-[3px]' : 'py-1'
  const visibles = data.columnas.filter((c) => !c.oculta)
  const tramos = tramosDeGrupo(visibles)
  const hayGrupos = tramos.some((t) => t.grupo !== '')

  return (
    <div className="flex flex-col min-w-0 min-h-0">
      {data.subtitulo && (
        <p className="text-center font-bold text-secondary text-[10px] uppercase tracking-wide mb-1 pl-5">
          {data.subtitulo}
        </p>
      )}

      <div className="flex items-center gap-2 min-h-0">
        <span
          className="font-bold italic text-navy text-[11px] whitespace-nowrap shrink-0"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {data.titulo}
        </span>

        <div className="pres-tabla-box px-3 py-2 overflow-hidden flex-1 min-w-0">
          <table className="w-full border-collapse text-[10px] leading-tight">
            <thead>
              {hayGrupos && (
                <tr className="text-gray-500">
                  {tramos.map((t, i) =>
                    t.grupo === '' ? (
                      <th key={`g-${i}`} colSpan={t.span} />
                    ) : (
                      <th
                        key={`g-${i}`}
                        colSpan={t.span}
                        className={`text-center font-bold text-gray-700 ${padY} px-1.5 border-b border-gray-200`}
                      >
                        {t.grupo}
                      </th>
                    )
                  )}
                </tr>
              )}
              <tr className="text-gray-500 border-b-2 border-gray-200">
                {visibles.map((col, i) => (
                  <th
                    key={col.clave}
                    className={`${alineacion(col)} font-semibold ${padY} px-1.5 ${i === 0 ? 'pl-2' : ''} ${
                      i === visibles.length - 1 ? 'pr-2' : ''
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.filas.map((fila, idx) => {
                const zebra = idx % 2 === 0 ? 'bg-surface' : 'bg-gray-50'
                const base = fila.esTotal
                  ? 'font-bold text-navy bg-navy/5 border-t-2 border-gray-300'
                  : `text-gray-700 ${zebra}`
                return (
                  <tr key={idx} className={base}>
                    {visibles.map((col, i) => {
                      const formato = col.formato ?? 'numero'
                      const colorPct = formato === 'porcentaje' ? colorSigno(fila[col.clave] as number | null) : ''
                      const fuerte = formato === 'texto' || formato === 'porcentaje'
                      return (
                        <td
                          key={col.clave}
                          className={`${alineacion(col)} ${padY} px-1.5 tabular-nums ${i === 0 ? 'pl-2' : ''} ${
                            i === visibles.length - 1 ? 'pr-2' : ''
                          } ${colorPct} ${fuerte ? 'font-semibold' : ''} ${
                            formato === 'texto' ? 'text-gray-700' : ''
                          }`}
                        >
                          {renderValor(col, fila)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {data.notaPie && <p className="text-right text-gray-400 italic text-[9px] mt-1.5 pl-5">{data.notaPie}</p>}
    </div>
  )
}
