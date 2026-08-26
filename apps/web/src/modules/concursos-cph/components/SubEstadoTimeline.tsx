// S4-9: barra de progreso del sub-estado — usa subEstado3 (la vista
// "resumida" de 8 etapas que calcSubEstado3 ya deriva del subEstado crudo de
// 19 niveles, ver concursosCph.calc.ts) en vez de subEstado directo: 19
// segmentos con nombres crípticos del legacy ("H-TAD", "K-ITE") no entran en
// una barra lineal legible. subEstado (crudo) se sigue mostrando aparte como
// badge en ConcursoCphDetail para quien necesite el detalle exacto.

const PASOS: { valor: string; label: string }[] = [
  { valor: 'A-VALID. VCTE', label: 'Vacante validada' },
  { valor: 'B-AUTORIZADO', label: 'Autorizado' },
  { valor: 'C-INSCRIPCION', label: 'Inscripción' },
  { valor: 'D-ETAPA EVAL', label: 'Etapa evaluación' },
  { valor: 'E-ADJUDI', label: 'Adjudicación' },
  { valor: 'F-PROX. A DESIG', label: 'Próx. a designación' },
  { valor: 'G-RESOLUCION', label: 'Resolución' },
]

export function SubEstadoTimeline({
  subEstado3,
  suspendido,
}: {
  subEstado3: string | null
  suspendido: boolean
}) {
  // Desierto es un final por fuera de la progresión lineal (el concurso no
  // "llegó más lejos", se cayó) — se muestra como estado propio, no como un
  // 8º segmento verde al final de la barra.
  if (subEstado3 === 'H-DESIERTO') {
    return (
      <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm font-semibold text-red-800">
        Concurso desierto
      </div>
    )
  }

  const actualIdx = PASOS.findIndex((p) => p.valor === subEstado3)

  return (
    <div className={suspendido ? 'opacity-50' : undefined}>
      {suspendido && <p className="text-xs font-semibold text-warning mb-1">Suspendido — sin avance</p>}
      <div className="flex">
        {PASOS.map((paso, i) => (
          <div key={paso.valor} className="flex-1 text-center" title={paso.label}>
            <div
              className={`h-2 ${i === 0 ? 'rounded-l' : ''} ${i === PASOS.length - 1 ? 'rounded-r' : ''} ${
                i < actualIdx
                  ? 'bg-secondary'
                  : i === actualIdx
                    ? 'bg-primary'
                    : 'bg-gray-200'
              } ${i > 0 ? 'ml-0.5' : ''}`}
            />
            <p
              className={`mt-1 text-[10px] leading-tight truncate ${
                i === actualIdx ? 'font-bold text-gray-800' : 'text-gray-400'
              }`}
            >
              {paso.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
