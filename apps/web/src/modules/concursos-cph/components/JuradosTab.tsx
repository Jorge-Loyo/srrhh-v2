// Pestaña "Jurados" de la página de concursos CPH. Tabla de jurados confirmados
// y vigentes (6 meses desde la fecha de sorteo), con búsqueda y filtro por
// especialidad, para poder gestionar decenas de jurados. Cada fila se puede
// expandir para ver los miembros (titulares/suplentes).
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { JuradoVigente } from '@srrhh/types'
import { useJuradosVigentes } from '../hooks/useConcursosCph'

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

function especialidadDe(j: JuradoVigente): string {
  return (
    j.concursoCph?.especialidadSolicitada ??
    j.concursoCph?.concurso?.cargo?.especialidadLegacy ??
    j.criterios?.especialidadConcurso ??
    '—'
  )
}

export function JuradosTab() {
  const { data: jurados = [], isLoading, isError } = useJuradosVigentes()
  const [busqueda, setBusqueda] = useState('')
  const [especialidad, setEspecialidad] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  // Opciones de especialidad para el filtro (únicas, ordenadas).
  const especialidades = useMemo(() => {
    const set = new Set<string>()
    jurados.forEach((j) => {
      const e = especialidadDe(j)
      if (e && e !== '—') set.add(e)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [jurados])

  const filtrados = useMemo(() => {
    const q = norm(busqueda)
    return jurados.filter((j) => {
      if (especialidad && especialidadDe(j) !== especialidad) return false
      if (!q) return true
      const cargo = j.concursoCph?.concurso?.cargo
      const texto = [
        cargo?.codigo,
        cargo?.literalPuesto,
        especialidadDe(j),
        cargo?.hospital?.sigla,
        cargo?.hospital?.nombre,
        ...j.miembros.map((m) => m.apellidoNombre),
      ]
        .map(norm)
        .join(' ')
      return texto.includes(q)
    })
  }, [jurados, busqueda, especialidad])

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-primary text-lg font-bold text-gray-900">Jurados vigentes</h2>
        <p className="text-sm text-gray-500">
          Jurados confirmados dentro de los últimos 6 meses, disponibles para reutilizar en
          concursos compatibles (mismo escalafón, especialidad y las reglas del sorteo).
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por cargo, especialidad, hospital o miembro…"
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
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando jurados…</p>}
        {isError && (
          <p className="p-6 text-sm text-danger">
            No se pudo cargar el listado de jurados vigentes.
          </p>
        )}
        {!isLoading && !isError && filtrados.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">
            {jurados.length === 0
              ? 'No hay jurados confirmados vigentes en este momento.'
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
                  <th className="px-4 py-3 font-semibold">Sorteo</th>
                  <th className="px-4 py-3 font-semibold">Vence</th>
                  <th className="px-4 py-3 font-semibold text-center">Miembros</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((j) => {
                  const cargo = j.concursoCph?.concurso?.cargo
                  const dias = diasRestantes(j.fechaVencimiento)
                  const abierto = expandido === j.id
                  const titulares = j.miembros.filter((m) => m.rol === 'titular')
                  const suplentes = j.miembros.filter((m) => m.rol === 'suplente')
                  return (
                    <Fragment key={j.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">
                          {cargo?.codigo ?? cargo?.literalPuesto ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{especialidadDe(j)}</td>
                        <td className="px-4 py-3 text-gray-600">{cargo?.hospital?.sigla ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{fechaCorta(j.fechaSorteo)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              dias <= 30
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {fechaCorta(j.fechaVencimiento)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{j.miembros.length}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setExpandido(abierto ? null : j.id)}
                            className="text-xs text-secondary hover:underline"
                          >
                            {abierto ? 'Ocultar' : 'Ver miembros'}
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                  Titulares
                                </p>
                                <ul className="space-y-0.5 text-xs text-gray-700">
                                  {titulares.map((m) => (
                                    <li key={m.id}>
                                      {m.apellidoNombre}
                                      {m.especialidad && (
                                        <span className="text-gray-400"> · {m.especialidad}</span>
                                      )}
                                      {m.esConduccion && (
                                        <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-600">
                                          conducción
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                  Suplentes
                                </p>
                                <ul className="space-y-0.5 text-xs text-gray-700">
                                  {suplentes.map((m) => (
                                    <li key={m.id}>
                                      {m.apellidoNombre}
                                      {m.especialidad && (
                                        <span className="text-gray-400"> · {m.especialidad}</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            {j.concursoCph?.id && (
                              <div className="mt-2 text-right">
                                <Link
                                  to={`/concursos/cph/${j.concursoCph.id}/wizard`}
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
          {filtrados.length} de {jurados.length} jurado(s) vigente(s)
        </p>
      )}
    </div>
  )
}
