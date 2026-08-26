import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoConcursoCph } from '@srrhh/types'
import type { ConcursoCph } from '@srrhh/types'
import { useConcursosCphAlertas } from '../hooks/useConcursosCph'
import { diasSinMovimiento } from '../lib/labels'

// S4-10: alertas de concursos sin movimiento > 30/60/90 días. Umbrales
// acumulativos a propósito (">= 90 días" es subconjunto de ">= 60", que a su
// vez es subconjunto de ">= 30") — mismo criterio que un dashboard de
// vencimientos, no 3 grupos disjuntos.
//
// Solo cuentan `no_iniciado`/`activo`: `suspendido` está parado a propósito
// (no es una alerta, es una decisión), y `finalizado`/`desierto` ya
// cerraron — no hay nada pendiente de mover ahí.
const UMBRALES = [
  { dias: 30, tono: 'warning' as const },
  { dias: 60, tono: 'danger' as const },
  { dias: 90, tono: 'danger' as const },
]

function estadoAlertable(estado: EstadoConcursoCph): boolean {
  return estado === EstadoConcursoCph.NO_INICIADO || estado === EstadoConcursoCph.ACTIVO
}

export function AlertasSinMovimiento() {
  const { data: todos, isLoading, isError } = useConcursosCphAlertas()
  const [umbralAbierto, setUmbralAbierto] = useState<number | null>(null)

  if (isLoading) return null
  if (isError) return null

  const alertables = (todos ?? []).filter((c) => estadoAlertable(c.estado))
  const conDias = alertables.map((c) => ({ concurso: c, dias: diasSinMovimiento(c.updatedAt) }))

  if (conDias.length === 0) return null

  const grupos = UMBRALES.map((u) => ({
    ...u,
    items: conDias.filter((x) => x.dias >= u.dias).sort((a, b) => b.dias - a.dias),
  }))

  const abierto = grupos.find((g) => g.dias === umbralAbierto)

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <h2 className="font-primary text-base font-bold text-gray-900">Alertas — concursos sin movimiento</h2>

      <div className="grid grid-cols-3 gap-3">
        {grupos.map((g) => (
          <button
            key={g.dias}
            type="button"
            onClick={() => setUmbralAbierto(umbralAbierto === g.dias ? null : g.dias)}
            disabled={g.items.length === 0}
            className={`rounded border p-3 text-left transition-colors disabled:opacity-40 disabled:cursor-default ${
              umbralAbierto === g.dias
                ? 'border-secondary bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{g.items.length}</p>
            <p className={`text-xs font-semibold ${g.tono === 'danger' ? 'text-danger' : 'text-warning'}`}>
              {g.dias}+ días sin movimiento
            </p>
          </button>
        ))}
      </div>

      {abierto && (
        <div className="border-t border-gray-100 pt-4">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Cargo</th>
                <th className="px-4 py-3 font-semibold">Sub-estado</th>
                <th className="px-4 py-3 font-semibold">Días</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {abierto.items.map(({ concurso, dias }: { concurso: ConcursoCph; dias: number }) => (
                <tr key={concurso.id}>
                  <td className="py-2 text-gray-600">{concurso.hospital?.sigla ?? '—'}</td>
                  <td className="py-2 text-gray-600">
                    {concurso.concurso?.cargo?.codigo ?? concurso.concurso?.cargo?.literalPuesto ?? '—'}
                  </td>
                  <td className="py-2 text-gray-600">{concurso.subEstado ?? '—'}</td>
                  <td className="py-2 text-gray-600">{dias} días</td>
                  <td className="py-2 text-right">
                    <Link to={`/concursos/cph/${concurso.id}`} className="btn-outline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
