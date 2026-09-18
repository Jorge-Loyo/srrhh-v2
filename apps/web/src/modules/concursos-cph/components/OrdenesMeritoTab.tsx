// Pestaña "Órdenes de mérito" de la página de concursos CPH. Lista las órdenes
// de mérito vigentes (6 meses o hasta designar/anular a todos sus integrantes)
// con los integrantes que siguen disponibles.
import { Link } from 'react-router-dom'
import type { OrdenMeritoVigente, OrdenMeritoIntegrante } from '@srrhh/types'
import { useOrdenesMeritoVigentes } from '../hooks/useConcursosCph'

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

function diasRestantes(vencimientoIso: string): number {
  const venc = new Date(vencimientoIso).getTime()
  return Math.ceil((venc - Date.now()) / (24 * 60 * 60 * 1000))
}

function IntegranteRow({ i }: { i: OrdenMeritoIntegrante }) {
  const estado = i.designado ? 'designado' : i.anulado ? 'anulado' : 'disponible'
  const estiloEstado =
    estado === 'disponible'
      ? 'bg-green-100 text-green-700'
      : estado === 'designado'
        ? 'bg-gray-200 text-gray-500'
        : 'bg-red-100 text-red-600'
  return (
    <li className="flex items-center gap-2 py-1 text-xs">
      <span className="w-6 shrink-0 text-right font-mono text-gray-400">{i.posicion}.</span>
      <span
        className={`flex-1 ${estado === 'disponible' ? 'text-gray-800' : 'text-gray-400 line-through'}`}
      >
        {i.apellidoNombre}
      </span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${estiloEstado}`}>
        {estado}
      </span>
    </li>
  )
}

function OrdenCard({ o }: { o: OrdenMeritoVigente }) {
  const cargo = o.concursoCph?.concurso?.cargo
  const dias = diasRestantes(o.fechaProrroga ?? o.fechaVencimiento)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-primary text-sm font-bold text-gray-900">
            {cargo?.codigo ?? o.puesto ?? 'Concurso'}
          </p>
          <p className="text-xs text-gray-500">
            {o.especialidad}
            {cargo?.hospital?.sigla && ` · ${cargo.hospital.sigla}`}
          </p>
        </div>
        <div className="text-right text-xs">
          <span
            className={`inline-block rounded-full px-2 py-0.5 font-medium ${
              dias <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
            }`}
          >
            Vence {fechaCorta(o.fechaProrroga ?? o.fechaVencimiento)}
          </span>
          <p className="mt-1 text-gray-400">
            {o.disponibles} disponible(s) de {o.integrantes.length}
          </p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-gray-50">
        {o.integrantes.map((i) => (
          <IntegranteRow key={i.id} i={i} />
        ))}
      </ul>

      {o.concursoCph?.id && (
        <div className="mt-3 border-t border-gray-100 pt-2 text-right">
          <Link
            to={`/concursos/cph/${o.concursoCph.id}/wizard`}
            className="text-xs text-secondary hover:underline"
          >
            Ver concurso de origen →
          </Link>
        </div>
      )}
    </div>
  )
}

export function OrdenesMeritoTab() {
  const { data: ordenes = [], isLoading, isError } = useOrdenesMeritoVigentes()

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-primary text-lg font-bold text-gray-900">Órdenes de mérito vigentes</h2>
        <p className="text-sm text-gray-500">
          Órdenes de mérito confirmadas y vigentes, con los integrantes disponibles para reutilizar
          en concursos del mismo puesto, especialidad y escalafón.
        </p>
      </div>

      {isLoading && <p className="p-6 text-sm text-gray-400">Cargando órdenes de mérito…</p>}
      {isError && (
        <p className="p-6 text-sm text-danger">
          No se pudo cargar el listado de órdenes de mérito.
        </p>
      )}
      {!isLoading && !isError && ordenes.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
          No hay órdenes de mérito vigentes con integrantes disponibles.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {ordenes.map((o) => (
          <OrdenCard key={o.id} o={o} />
        ))}
      </div>
    </div>
  )
}
