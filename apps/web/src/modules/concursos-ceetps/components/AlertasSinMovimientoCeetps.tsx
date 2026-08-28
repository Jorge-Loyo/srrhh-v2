import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoConcursoCeetps } from '@srrhh/types'
import type { ConcursoCeetps } from '@srrhh/types'
import { useConcursosCeetpsAlertas } from '../hooks/useConcursosCeetps'
import { diasSinMovimiento } from '../lib/labels'

// S5-9: alertas de concursos CEETPS sin movimiento > 30/60/90 días — mismo
// criterio acumulativo que AlertasSinMovimiento (CPH, S4-10). A diferencia de
// CPH, acá no existe estado `suspendido` (ver EstadoConcursoCeetps): solo se
// excluyen los terminales `finalizado`/`desierto`.
const UMBRALES = [
  { dias: 30, tono: 'warning' as const },
  { dias: 60, tono: 'danger' as const },
  { dias: 90, tono: 'danger' as const },
]

function estadoAlertable(estado: EstadoConcursoCeetps): boolean {
  return estado !== EstadoConcursoCeetps.FINALIZADO && estado !== EstadoConcursoCeetps.DESIERTO
}

export function AlertasSinMovimientoCeetps() {
  const { data: todos, isLoading, isError } = useConcursosCeetpsAlertas()
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
              umbralAbierto === g.dias ? 'border-secondary bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
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
            <thead className="text-gray-500 text-left">
              <tr>
                <th className="pb-2 font-semibold">Hospital</th>
                <th className="pb-2 font-semibold">Escalafón</th>
                <th className="pb-2 font-semibold">Estado</th>
                <th className="pb-2 font-semibold">Días</th>
                <th className="pb-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {abierto.items.map(({ concurso, dias }: { concurso: ConcursoCeetps; dias: number }) => (
                <tr key={concurso.id}>
                  <td className="py-2 text-gray-600">{concurso.hospital?.sigla ?? '—'}</td>
                  <td className="py-2 text-gray-600">{concurso.escalafon?.nombre ?? '—'}</td>
                  <td className="py-2 text-gray-600">{concurso.estado}</td>
                  <td className="py-2 text-gray-600">{dias} días</td>
                  <td className="py-2 text-right">
                    <Link to={`/concursos/ceetps/${concurso.id}`} className="btn-outline">
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
