import { useState } from 'react'
import { TipoConcurso } from '@srrhh/types'
import type { ConcursoBandejaFilters, ConcursoBandejaItem } from '@srrhh/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { motivoConcursoLabel } from '@/modules/cargos/lib/bajasHelpers'
import { useBandejaConcursos } from '../hooks/useBandejaConcursos'

const LIMIT = 50

// Bandeja mixta de concursos (PASO 1 del flujo). Es la gestión del INICIO de
// todos los concursos (CPH + CEETPS juntos), mudada de la pestaña "Concursos"
// de /concursos/cph a /cargos/concurso y ampliada para incluir CEETPS.
//
// Decisión de implementación sobre stepper / etiquetas / importar CSV (CPH-only):
//   - NO se porta el mini-stepper de 5 etapas: es específico del flujo CPH y no
//     tiene equivalente en CEETPS. En su lugar la bandeja muestra Estado +
//     Sub-estado como texto, que funciona para ambos tipos.
//   - NO se porta el etiquetado masivo ni el importar CSV: son acciones CPH
//     específicas de /concursos/cph (quedan intactas allí).
// La prioridad del paso es listar CPH+CEETPS con las columnas comunes correctas
// y filtrables por tipo; los flujos por rol de cada pantalla son pasos posteriores.

// Labels de estado comunes a ambos tipos (CPH + CEETPS). El estado llega como
// string crudo de la extensión; este mapa cubre los dos enums. Fallback: el
// propio valor con la primera letra en mayúscula.
const ESTADO_LABEL: Record<string, string> = {
  // CPH
  no_iniciado: 'No iniciado',
  activo: 'Activo',
  finalizado: 'Finalizado',
  suspendido: 'Suspendido',
  // CEETPS
  sin_autorizar: 'Sin autorizar',
  autorizado: 'Autorizado',
  en_proceso: 'En proceso',
  desierto: 'Desierto',
}

function estadoLabel(estado: string | null): string {
  if (!estado) return '—'
  return ESTADO_LABEL[estado] ?? estado.charAt(0).toUpperCase() + estado.slice(1).replace(/_/g, ' ')
}

function tipoBadgeClass(tipo: ConcursoBandejaItem['tipo']): string {
  return tipo === TipoConcurso.CPH
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-teal-100 text-teal-700'
}

function diasSinMovimiento(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function BandejaConcursosPage() {
  const [search, setSearch] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [tipo, setTipo] = useState<'' | TipoConcurso>('')
  const [page, setPage] = useState(1)
  const searchDebounced = useDebounce(search, 300)

  const filters: ConcursoBandejaFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(tipo && { tipo }),
  }

  const { data, isLoading, isFetching, isError } = useBandejaConcursos(filters)
  const { data: hospitales } = useHospitales()

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div>
          <h1 className="font-primary text-xl font-bold text-gray-900">Concursos</h1>
          <p className="text-sm text-gray-500">
            Bandeja de inicio de todos los concursos (CPH y CEETPS). Cuando se autorizan,
            pasan al flujo que corresponda.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por expediente, puesto, efector..."
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <select
            value={hospitalId}
            onChange={(e) => resetPage(setHospitalId)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los hospitales</option>
            {hospitales?.map((h) => (
              <option key={h.id} value={h.id}>
                {hospitalLabel(h)}
              </option>
            ))}
          </select>
          <select
            value={tipo}
            onChange={(e) => resetPage(setTipo)(e.target.value as '' | TipoConcurso)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los tipos</option>
            <option value={TipoConcurso.CPH}>CPH</option>
            <option value={TipoConcurso.CEETPS}>CEETPS</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando concursos...</p>}
        {isError && (
          <p className="p-6 text-sm text-danger">No se pudo cargar la bandeja de concursos.</p>
        )}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">
                Sin resultados para los filtros aplicados.
              </p>
            )}

            {data.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''}`}>
                  <thead className="bg-navy text-white text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Tipo</th>
                      <th className="px-4 py-3 font-semibold">Hospital</th>
                      <th className="px-4 py-3 font-semibold">Puesto</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold">Motivo</th>
                      <th className="px-4 py-3 font-semibold">Últ. movimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.data.map((c) => {
                      const dias = diasSinMovimiento(c.ultimoMovimiento)
                      const motivo = motivoConcursoLabel(c.motivoConcurso)
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${tipoBadgeClass(c.tipo)}`}
                            >
                              {c.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.hospitalSigla ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {c.puesto ?? '—'}
                            {c.especialidad && (
                              <span className="block text-xs text-gray-400">{c.especialidad}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-gray-700">{estadoLabel(c.estado)}</span>
                              {c.subEstado && (
                                <span className="text-xs text-gray-500">{c.subEstado}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {motivo && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                {motivo}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {dias === 0 ? 'Hoy' : `${dias} días`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn-outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    className="btn-outline"
                    disabled={page >= data.meta.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
