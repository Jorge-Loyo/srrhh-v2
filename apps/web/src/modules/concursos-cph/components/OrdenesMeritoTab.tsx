// Pestaña "Órdenes de mérito" de la página de concursos CPH. Tabla de órdenes
// de mérito vigentes (6 meses o hasta designar/anular a todos sus integrantes)
// con búsqueda y filtro por especialidad, para gestionar muchas. Cada fila se
// expande para ver los integrantes y su estado (disponible/designado/anulado).
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { OrdenMeritoVigente, OrdenMeritoIntegrante } from '@srrhh/types'
import { useOrdenesMeritoVigentes } from '../hooks/useConcursosCph'

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

function diasRestantes(vencimientoIso: string): number {
  return Math.ceil((new Date(vencimientoIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
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

export function OrdenesMeritoTab() {
  const { data: ordenes = [], isLoading, isError } = useOrdenesMeritoVigentes()
  const [busqueda, setBusqueda] = useState('')
  const [especialidad, setEspecialidad] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  const especialidades = useMemo(() => {
    const set = new Set<string>()
    ordenes.forEach((o) => {
      if (o.especialidad) set.add(o.especialidad)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [ordenes])

  const filtrados = useMemo(() => {
    const q = norm(busqueda)
    return ordenes.filter((o) => {
      if (especialidad && o.especialidad !== especialidad) return false
      if (!q) return true
      const cargo = o.concursoCph?.concurso?.cargo
      const texto = [
        cargo?.codigo,
        cargo?.literalPuesto,
        o.especialidad,
        o.puesto,
        cargo?.hospital?.sigla,
        cargo?.hospital?.nombre,
        ...o.integrantes.map((i) => i.apellidoNombre),
      ]
        .map(norm)
        .join(' ')
      return texto.includes(q)
    })
  }, [ordenes, busqueda, especialidad])

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-primary text-lg font-bold text-gray-900">Órdenes de mérito vigentes</h2>
        <p className="text-sm text-gray-500">
          Órdenes de mérito confirmadas y vigentes, con los integrantes disponibles para reutilizar
          en concursos del mismo puesto, especialidad y escalafón.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por cargo, especialidad, hospital o integrante…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="h-10 flex-1 min-w-[240px] rounded border border-gray-300 px-3 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          />
          <select
            value={especialidad}
            onChange={(e) => setEspecialidad(e.target.value)}
            className="h-10 rounded border border-gray-300 px-3 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todas las especialidades</option>
            {especialidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando órdenes de mérito…</p>}
        {isError && (
          <p className="p-6 text-sm text-danger">
            No se pudo cargar el listado de órdenes de mérito.
          </p>
        )}
        {!isLoading && !isError && filtrados.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">
            {ordenes.length === 0
              ? 'No hay órdenes de mérito vigentes con integrantes disponibles.'
              : 'Sin resultados para la búsqueda.'}
          </p>
        )}

        {filtrados.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-left text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cargo</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Publicada</th>
                  <th className="px-4 py-3 font-semibold">Vence</th>
                  <th className="px-4 py-3 font-semibold text-center">Disponibles</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((o) => {
                  const cargo = o.concursoCph?.concurso?.cargo
                  const dias = diasRestantes(o.fechaProrroga ?? o.fechaVencimiento)
                  const abierto = expandido === o.id
                  return (
                    <Fragment key={o.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">
                          {cargo?.codigo ?? o.puesto ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{o.especialidad}</td>
                        <td className="px-4 py-3 text-gray-600">{cargo?.hospital?.sigla ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {fechaCorta(o.fechaPublicacion)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              dias <= 30
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {fechaCorta(o.fechaProrroga ?? o.fechaVencimiento)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            {o.disponibles} / {o.integrantes.length}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setExpandido(abierto ? null : o.id)}
                            className="text-xs text-secondary hover:underline"
                          >
                            {abierto ? 'Ocultar' : 'Ver integrantes'}
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-4 py-3">
                            <ul className="divide-y divide-gray-100">
                              {o.integrantes.map((i) => (
                                <IntegranteRow key={i.id} i={i} />
                              ))}
                            </ul>
                            {o.concursoCph?.id && (
                              <div className="mt-2 text-right">
                                <Link
                                  to={`/concursos/cph/${o.concursoCph.id}/wizard`}
                                  className="text-xs text-secondary hover:underline"
                                >
                                  Ver concurso de origen →
                                </Link>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtrados.length > 0 && (
        <p className="text-xs text-gray-400">
          {filtrados.length} de {ordenes.length} orden(es) de mérito vigente(s)
        </p>
      )}
    </div>
  )
}
