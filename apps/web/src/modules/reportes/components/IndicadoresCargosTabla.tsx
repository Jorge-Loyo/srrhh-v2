import type {
  CargosIndicadores,
  CargosIndicadoresCelda,
  CargosIndicadoresFila,
  CargosIndicadoresTablaMeta,
  CargosIndicadoresTendencia,
} from '@srrhh/types'

// Tabla de una de las tres vistas de indicadores. Sin reglas de negocio: la API
// decide columnas visibles, notas y tendencia; acá solo se da formato.

interface Props {
  meta: CargosIndicadoresTablaMeta
  filas: CargosIndicadoresFila[]
  total: CargosIndicadoresFila
  actual: CargosIndicadores['actual']
  anterior: CargosIndicadores['anterior']
  referenciaPersonas: CargosIndicadores['referenciaPersonas']
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function rotuloMes(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? m}-${y}`
}

function fmt(n: number | null): string {
  return n === null ? 'n/d' : n.toLocaleString('es-AR')
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  const txt = Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${txt} %`
}

function fmtAbs(n: number | null): string {
  if (n === null) return '—'
  return `${n > 0 ? '+' : ''}${n.toLocaleString('es-AR')}`
}

const TENDENCIA: Record<CargosIndicadoresTendencia, { clase: string; flecha: string; aria: string }> = {
  sube: { clase: 'text-green-700', flecha: '▲', aria: 'aumentó' },
  baja: { clase: 'text-red-700', flecha: '▼', aria: 'disminuyó' },
  igual: { clase: 'text-gray-500', flecha: '=', aria: 'sin cambio' },
}

function Valor({ n, aprox }: { n: number | null; aprox: number }) {
  return (
    <span title={aprox > 0 && n !== null ? `${aprox} de ${n} cargos inferidos` : undefined}>
      {fmt(n)}
      {aprox > 0 && n !== null && <span className="text-gray-400"> ~</span>}
    </span>
  )
}

function Celdas({ celda, negrita, referencia }: { celda: CargosIndicadoresCelda; negrita: boolean; referencia?: string }) {
  const t = celda.tendencia ? TENDENCIA[celda.tendencia] : null
  const base = `px-2 py-1.5 text-right tabular-nums ${negrita ? 'font-bold' : ''}`
  return (
    <>
      <td className={base} title={referencia}>
        <Valor n={celda.actual} aprox={celda.actualAprox} />
      </td>
      <td className={`${base} ${celda.anterior === null ? 'text-gray-400' : 'text-gray-600'}`}>
        <Valor n={celda.anterior} aprox={celda.anteriorAprox} />
      </td>
      <td className={`${base} ${t ? t.clase : 'text-gray-400'}`}>
        {t ? (
          <>
            <span aria-label={t.aria}>{t.flecha}</span> {fmtAbs(celda.variacionAbs)}
          </>
        ) : (
          '—'
        )}
      </td>
      <td
        className={`${base} ${t ? t.clase : 'text-gray-400'}`}
        title={celda.variacionPct === null && celda.variacionAbs !== null ? 'sin base de comparación' : undefined}
      >
        {fmtPct(celda.variacionPct)}
      </td>
    </>
  )
}

export function IndicadoresCargosTabla({ meta, filas, total, actual, anterior, referenciaPersonas }: Props) {
  const mesA = rotuloMes(actual.mes)
  const mesP = rotuloMes(anterior.mes)
  const refTitulo = (id: string) =>
    id === 'personas_ref'
      ? `Personas al ${referenciaPersonas.actualFecha ?? 'n/d'} (actual) y al ${referenciaPersonas.anteriorFecha ?? 'n/d'} (anterior)`
      : undefined
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-md">
      <table className="min-w-full text-sm font-primary border-collapse">
        <caption className="text-left px-3 py-2 bg-gray-50 border-b border-gray-200">
          <span className="font-bold text-gray-900">{meta.titulo}</span>
          {meta.nota && <span className="ml-2 text-xs text-gray-500">{meta.nota}</span>}
        </caption>
        <thead>
          <tr className="bg-gray-50 text-gray-700">
            <th
              scope="col"
              rowSpan={2}
              className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold border-b border-gray-200"
            >
              Carrera
            </th>
            {meta.columnas.map((c) => (
              <th
                key={c.id}
                scope="colgroup"
                colSpan={4}
                title={c.nota ?? undefined}
                className={`px-2 py-2 text-center border-l border-gray-200 ${c.destacada ? 'font-bold' : 'font-semibold'}`}
              >
                {c.etiqueta}
              </th>
            ))}
          </tr>
          <tr className="bg-gray-50 text-xs text-gray-500">
            {meta.columnas.map((c) => (
              <ColumnasMes key={c.id} mesA={mesA} mesP={mesP} />
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.carreraId ?? 'sin-codigo'} className="border-t border-gray-100 hover:bg-gray-50">
              <th scope="row" className="sticky left-0 bg-white px-3 py-1.5 text-left font-normal text-gray-800 whitespace-nowrap">
                {f.etiqueta}
              </th>
              {meta.columnas.map((c) => (
                <Celdas key={c.id} celda={f.celdas[c.id]} negrita={c.destacada} referencia={refTitulo(c.id)} />
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
            <th scope="row" className="sticky left-0 bg-gray-50 px-3 py-1.5 text-left">
              Total
            </th>
            {meta.columnas.map((c) => (
              <Celdas key={c.id} celda={total.celdas[c.id]} negrita referencia={refTitulo(c.id)} />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Bloque APARTE y visualmente diferenciado (ámbar, borde punteado): cargos que pasaron a no
// vigente dentro de cada período. Es informativo y NO se suma al total a gestionar. Una
// columna con ~ incluye fechas de pasaje inferidas; n/d = período sin datos reconstruibles.
export function PasaronNoVigenteBloque({
  filas,
  total,
  actual,
  anterior,
  noVigenteSinFecha,
}: {
  filas: CargosIndicadoresFila[]
  total: CargosIndicadoresFila
  actual: CargosIndicadores['actual']
  anterior: CargosIndicadores['anterior']
  noVigenteSinFecha: number | null
}) {
  const mesA = rotuloMes(actual.mes)
  const mesP = rotuloMes(anterior.mes)
  const ventana = (p: CargosIndicadores['actual']) => `${p.desde} al ${p.fechaCorte}`
  return (
    <div className="overflow-x-auto border-2 border-dashed border-amber-400 rounded-md bg-amber-50/40" data-testid="pasaron-no-vigente">
      <table className="min-w-full text-sm font-primary border-collapse">
        <caption className="text-left px-3 py-2 bg-amber-50 border-b border-amber-200">
          <span className="font-bold text-amber-900">Salieron de la gestión: pasaron a no vigente en el período</span>
          <span className="ml-2 text-xs text-amber-800">
            Informativo: NO forma parte del total a gestionar ni se suma a ninguna columna. Cuenta los cargos que hoy
            son no vigentes y cuyo pasaje ocurrió en el período ({mesA}: {ventana(actual)}; {mesP}: {ventana(anterior)}).
            ~ = fecha de pasaje inferida del padrón. n/d = período sin datos.
          </span>
        </caption>
        <thead>
          <tr className="bg-amber-50 text-xs text-amber-900">
            <th scope="col" className="sticky left-0 z-10 bg-amber-50 px-3 py-2 text-left font-semibold border-b border-amber-200">
              Carrera
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium border-l border-amber-200">{mesA}</th>
            <th scope="col" className="px-2 py-1 text-right font-medium">{mesP}</th>
            <th scope="col" className="px-2 py-1 text-right font-medium" title="Variación absoluta (color por signo del cambio, no por juicio)">Var.</th>
            <th scope="col" className="px-2 py-1 text-right font-medium" title="Variación porcentual">Var. %</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.carreraId ?? 'sin-codigo'} className="border-t border-amber-100">
              <th scope="row" className="sticky left-0 bg-amber-50 px-3 py-1.5 text-left font-normal text-gray-800 whitespace-nowrap">
                {f.etiqueta}
              </th>
              <Celdas celda={f.pasaronNoVigente} negrita={false} />
            </tr>
          ))}
          <tr className="border-t-2 border-amber-300 bg-amber-50 font-bold">
            <th scope="row" className="sticky left-0 bg-amber-50 px-3 py-1.5 text-left">
              Total
            </th>
            <Celdas celda={total.pasaronNoVigente} negrita />
          </tr>
        </tbody>
      </table>
      {noVigenteSinFecha !== null && noVigenteSinFecha > 0 && (
        <p className="px-3 py-2 text-xs text-amber-800 border-t border-amber-200">
          n/d: {noVigenteSinFecha.toLocaleString('es-AR')} cargos no vigentes no tienen fecha de pasaje determinable y no
          están incluidos en ningún período.
        </p>
      )}
    </div>
  )
}
function ColumnasMes({ mesA, mesP }: { mesA: string; mesP: string }) {
  return (
    <>
      <th scope="col" className="px-2 py-1 text-right font-medium border-l border-gray-200">{mesA}</th>
      <th scope="col" className="px-2 py-1 text-right font-medium">{mesP}</th>
      <th scope="col" className="px-2 py-1 text-right font-medium" title="Variación absoluta (color por signo del cambio, no por juicio)">Var.</th>
      <th scope="col" className="px-2 py-1 text-right font-medium" title="Variación porcentual">Var. %</th>
    </>
  )
}
