import type { NodoCadenaRetencion } from '@srrhh/types'

interface Props {
  nodos: NodoCadenaRetencion[]
}

const TIPO_BADGE: Record<string, string> = {
  R:   'bg-amber-100 text-amber-700',
  TTR: 'bg-purple-100 text-purple-700',
}

function tipoBadge(tipo: NodoCadenaRetencion['tipoOrigen']) {
  if (!tipo) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">BASE</span>
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIPO_BADGE[tipo]}`}>{tipo}</span>
}

function diasRestantes(periodoHasta: string | null | undefined): string | null {
  if (!periodoHasta) return null
  // Comparar fecha-calendario contra fecha-calendario (ambas ancladas a
  // medianoche UTC), no contra Date.now() — si no, en timezones negativos
  // (ej. Argentina, UTC-3) el período aparece "vencido" desde la tarde del
  // día anterior a la fecha real de vencimiento.
  const hoy = new Date()
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const dias = Math.round((Date.parse(`${periodoHasta}T00:00:00Z`) - Date.parse(`${hoyIso}T00:00:00Z`)) / 86_400_000)
  if (dias < 0) return 'período vencido'
  return `vence en ${dias} días`
}

// Timeline vertical — mismo estilo visual que CadenaMandoPanel (cadena-mando/),
// porque la cadena de retención también es lineal (base → más reciente), no
// ramificada.
export function CadenaRetencionTree({ nodos }: Props) {
  if (nodos.length === 0) {
    return <p className="text-sm text-gray-400">Sin cadena de retención.</p>
  }

  return (
    <ol className="relative border-l-2 border-gray-200 space-y-0">
      {nodos.map((nodo, i) => {
        const restante = diasRestantes(nodo.periodoHasta)
        return (
          <li key={nodo.id} className="ml-4 pb-4 last:pb-0">
            <span className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${i === nodos.length - 1 ? 'bg-secondary' : 'bg-gray-300'}`} />

            <div className="flex items-start gap-2 flex-wrap">
              {tipoBadge(nodo.tipoOrigen)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {nodo.literalPuesto ?? nodo.codigo ?? nodo.id}
                </p>
                <p className="text-xs text-gray-400 font-mono">{nodo.codigo}</p>
                {nodo.estaOcupado ? (
                  <p className="text-xs text-gray-600 mt-0.5">
                    <span className="font-medium">{nodo.ocupanteNombre}</span>
                    {nodo.ocupanteCuil && <span className="text-gray-400"> · {nodo.ocupanteCuil}</span>}
                  </p>
                ) : (
                  <p className="text-xs text-amber-500 mt-0.5 italic">Vacante</p>
                )}
                {restante && (
                  <p className={`text-xs mt-0.5 ${restante === 'período vencido' ? 'text-danger font-medium' : 'text-gray-400'}`}>
                    {restante}
                  </p>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
