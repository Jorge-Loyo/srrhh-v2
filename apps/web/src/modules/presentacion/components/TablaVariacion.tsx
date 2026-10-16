import type { TablaVariacion as TablaVariacionData } from '../data/types'
import { fmtNum, fmtDif, fmtPct, colorSigno } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// Tabla de variación reutilizable (Estado / Escalafón / Universo / Efector /
// Especialidad y futuras). Puramente presentacional: recibe un TablaVariacion y
// lo pinta con el tema Obelisco. El título lateral vertical replica el diseño.
//
// Encuadre: la tabla vive dentro de un "box" con contorno gris suavizado
// (.pres-tabla-box) para separarla del resto, y las filas alternan blanco/gris
// (zebra). Subtítulo y nota al pie quedan fuera del box.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  data: TablaVariacionData
  /** Densidad del padding de filas: 'normal' | 'densa' | 'compacta' (muchas filas). */
  densidad?: 'normal' | 'densa' | 'compacta'
  /** Atajo: densa=true equivale a densidad='densa' (compatibilidad). */
  densa?: boolean
}

export function TablaVariacion({ data, densidad, densa = false }: Props) {
  const nivel = densidad ?? (densa ? 'densa' : 'normal')
  const padY = nivel === 'compacta' ? 'py-[1px]' : nivel === 'densa' ? 'py-[3px]' : 'py-1'
  const fontTabla = nivel === 'compacta' ? 'text-[9px]' : 'text-[10px]'
  const tieneSub = Boolean(data.columnaSubEtiqueta)
  const tieneValorPrevio = Boolean(data.columnaValorPrevio)
  const decPct = data.decimalesPct ?? 2

  return (
    <div className="flex flex-col min-w-0 min-h-0">
      {data.subtitulo && (
        <p className="text-center font-bold text-secondary text-[10px] uppercase tracking-wide mb-1 pl-5">
          {data.subtitulo}
        </p>
      )}

      {/* Fila: título vertical centrado respecto al box de la tabla */}
      <div className="flex items-center gap-2 min-h-0">
        <span
          className="font-bold italic text-navy text-[11px] whitespace-nowrap shrink-0"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {data.titulo}
        </span>

        {/* Box con contorno suavizado */}
        <div className="pres-tabla-box px-3 py-2 overflow-hidden flex-1 min-w-0">
          <table className={`w-full border-collapse leading-tight ${fontTabla}`}>
            <thead>
              {data.tituloValores && (
                <tr>
                  <th colSpan={tieneSub ? 2 : 1} />
                  <th
                    colSpan={data.meses.length + 2}
                    className="text-center font-bold text-gray-600 pb-0.5 text-[10px]"
                  >
                    {data.tituloValores}
                  </th>
                </tr>
              )}
              <tr className="text-gray-500 border-b-2 border-gray-200">
                <th className={`text-left font-semibold ${padY} pl-2 pr-2`}>{data.columnaEtiqueta}</th>
                {tieneSub && <th className={`text-left font-semibold ${padY} pr-2`}>{data.columnaSubEtiqueta}</th>}
                {tieneValorPrevio && (
                  <th className={`text-right font-semibold ${padY} px-1.5`}>{data.columnaValorPrevio}</th>
                )}
                {data.meses.map((m) => (
                  <th key={m} className={`text-right font-semibold ${padY} px-1.5`}>
                    {m}
                  </th>
                ))}
                <th className={`text-right font-semibold ${padY} px-1.5`}>Dif.</th>
                <th className={`text-right font-semibold ${padY} pr-2 pl-1.5`}>% Var. Cuatrim</th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map((fila, i) => {
                // Zebra: alterna blanco/gris en filas normales. La fila TOTAL se
                // destaca con fondo navy tenue y borde superior.
                const zebra = i % 2 === 0 ? 'bg-surface' : 'bg-gray-50'
                const base = fila.esTotal
                  ? 'font-bold text-navy bg-navy/5 border-t-2 border-gray-300'
                  : `text-gray-700 ${zebra}`
                return (
                  <tr key={`${fila.etiqueta}-${fila.subEtiqueta ?? ''}-${i}`} className={base}>
                    <td className={`text-left ${padY} pl-2 pr-2 rounded-l-sm`}>{fila.etiqueta}</td>
                    {tieneSub && (
                      <td className={`text-left ${padY} pr-2 text-gray-500 font-semibold uppercase text-[9px]`}>
                        {fila.subEtiqueta}
                      </td>
                    )}
                    {tieneValorPrevio && (
                      <td className={`text-right ${padY} px-1.5 tabular-nums text-gray-800 font-semibold`}>
                        {fmtNum(fila.valorPrevio)}
                      </td>
                    )}
                    {fila.valores.map((v, idx) => {
                      const esUltimo = idx === fila.valores.length - 1
                      return (
                        <td
                          key={idx}
                          className={`text-right ${padY} px-1.5 tabular-nums ${
                            esUltimo || fila.esTotal ? 'text-gray-800 font-semibold' : 'text-gray-400'
                          }`}
                        >
                          {fmtNum(v)}
                        </td>
                      )
                    })}
                    <td className={`text-right ${padY} px-1.5 tabular-nums font-semibold ${colorSigno(fila.diferencia)}`}>
                      {fmtDif(fila.diferencia)}
                    </td>
                    <td
                      className={`text-right ${padY} pr-2 pl-1.5 tabular-nums font-semibold rounded-r-sm ${colorSigno(fila.variacionPct)}`}
                    >
                      {fmtPct(fila.variacionPct, decPct)}
                    </td>
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
