import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoConcursoCph } from '@srrhh/types'
import type { ConcursoCph, ConcursoCphFilters } from '@srrhh/types'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { useConcursosCph } from '../hooks/useConcursosCph'
import { useEtiquetas, useAsignarEtiqueta, useCrearEtiqueta } from '../hooks/useEtiquetas'
import { FlujoConcursoModal } from '../components/FlujoConcursoModal'
import { EtiquetasControl } from '../components/EtiquetasControl'
import { apiClient } from '@/shared/lib/api-client'
import { useToast } from '@/shared/components/ui/useToast'
import {
  ESTADO_LABEL,
  SUB_ESTADO_OPTIONS,
  SUB_ESTADO_3_OPTIONS,
  diasSinMovimiento,
  diasBadgeClass,
} from '../lib/labels'

const LIMIT = 50

// Semáforo de estado del concurso (primera columna de la tabla). El campo
// booleano `suspendido` puede estar activo aunque el estado calculado no sea
// 'suspendido', así que tiene prioridad para el color rojo.
function semaforoClass(c: ConcursoCph): string {
  if (c.suspendido || c.estado === 'suspendido') return 'bg-red-500'
  if (c.estado === 'activo') return 'bg-green-500'
  if (c.estado === 'finalizado') return 'bg-orange-500'
  return 'bg-gray-300' // no_iniciado
}

function semaforoLabel(c: ConcursoCph): string {
  if (c.suspendido || c.estado === 'suspendido') return 'Suspendido'
  if (c.estado === 'activo') return 'Activo'
  if (c.estado === 'finalizado') return 'Finalizado'
  return 'No iniciado'
}

// Las 5 etapas del concurso CPH (mismas que el wizard).
const ETAPAS = [
  'Baja / Apertura',
  'Autorización / Jurado',
  'Inscripción / Examen / OM',
  'IFACS / INSAL',
  'Designación',
] as const

// Mapea el subEstado (con su prefijo de letra) al número de etapa 1..5.
function etapaActual(subEstado: string | null): number {
  const s = subEstado ?? ''
  if (['A-AUTZN', 'B-SORTEO JUR', 'C-DISPO DE LLAMADO'].includes(s)) return 2
  if (['C2-INSCRIPCION EX', 'D-EXAMEN PUBLICADO', 'E-ORDEN DE MERITO'].includes(s)) return 3
  if (['F-IFACS', 'G-INSAL'].includes(s)) return 4
  if (
    [
      'H-TAD',
      'I-CARGA DOCU',
      'J-APTO MED',
      'K-ITE',
      'L-PYCTO DE RESO',
      'M-RESO A LA FIRMA',
      'N-DESIGNADO',
      'O-ALTA SIAL',
      'Q-DESIERTO',
    ].includes(s)
  )
    return 5
  return 1 // VACANTE, NO INICIADO, A-CARATULADO
}

// Mini-stepper de 5 pasos para la columna "Etapa". El paso actual se resalta,
// los anteriores van con check, los siguientes en gris.
function EtapaStepper({ subEstado }: { subEstado: string | null }) {
  const actual = etapaActual(subEstado)
  return (
    <div className="flex items-center gap-1">
      {ETAPAS.map((titulo, idx) => {
        const num = idx + 1
        const completa = num < actual
        const esActual = num === actual
        return (
          <span
            key={num}
            title={`${num}. ${titulo}${esActual ? ' (actual)' : completa ? ' ✓' : ''}`}
            className={[
              'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
              esActual
                ? 'bg-secondary text-white ring-2 ring-secondary/30'
                : completa
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-400',
            ].join(' ')}
          >
            {completa ? '✓' : num}
          </span>
        )
      })}
    </div>
  )
}

export function ConcursosCphPage() {
  const [search, setSearch] = useState('')
  const [especialidad, setEspecialidad] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [estado, setEstado] = useState<'' | EstadoConcursoCph>('')
  const [subEstado, setSubEstado] = useState('')
  const [subEstado3, setSubEstado3] = useState('')
  const [page, setPage] = useState(1)
  const [showFlujo, setShowFlujo] = useState(false)
  const [conFaltantes, setConFaltantes] = useState(false)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState<{
    total: number
    actualizados: number
    creados: number
    noEncontrados: number
  } | null>(null)
  const searchDebounced = useDebounce(search, 300)
  const especialidadDebounced = useDebounce(especialidad, 300)

  // ── Etiquetado masivo ──
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [etiquetaMasiva, setEtiquetaMasiva] = useState('') // nombre elegido o nuevo
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false)
  const { data: catalogoEtiquetas = [] } = useEtiquetas()
  const asignarEtiqueta = useAsignarEtiqueta()
  const crearEtiqueta = useCrearEtiqueta()
  const { toast, ToastUI } = useToast()

  async function handleImportarCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiClient.post('/api/v1/concursos-cph/importar-csv', form)
      setImportResult(res.data.data)
    } catch {
      toast.error('Error al importar el archivo')
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  const filters: ConcursoCphFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(especialidadDebounced && { especialidad: especialidadDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(estado && { estado }),
    ...(subEstado && { subEstado }),
    ...(subEstado3 && { subEstado3 }),
    ...(conFaltantes && { conFaltantes: true }),
  }

  const { data, isLoading, isFetching, isError } = useConcursosCph(filters)
  const { data: hospitales } = useHospitales()

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  const filasVisibles = data?.data ?? []
  const todasSeleccionadas =
    filasVisibles.length > 0 && filasVisibles.every((c) => seleccionados.has(c.id))

  function toggleSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodas() {
    setSeleccionados((prev) => {
      if (filasVisibles.every((c) => prev.has(c.id))) {
        // deseleccionar solo las visibles
        const next = new Set(prev)
        filasVisibles.forEach((c) => next.delete(c.id))
        return next
      }
      const next = new Set(prev)
      filasVisibles.forEach((c) => next.add(c.id))
      return next
    })
  }

  function salirModoSeleccion() {
    setModoSeleccion(false)
    setSeleccionados(new Set())
    setEtiquetaMasiva('')
  }

  // Aplica la etiqueta elegida (existente por nombre, o nueva) a todos los
  // concursos seleccionados. Crea la etiqueta si el nombre no existe.
  async function aplicarEtiquetaMasiva() {
    const nombre = etiquetaMasiva.trim()
    const ids = [...seleccionados]
    if (!nombre || ids.length === 0) return
    setAplicandoMasivo(true)
    try {
      const existente = catalogoEtiquetas.find(
        (e) => e.nombre.toLowerCase() === nombre.toLowerCase(),
      )
      const etiquetaId = existente ? existente.id : (await crearEtiqueta.mutateAsync({ nombre })).id
      let ok = 0
      for (const concursoCphId of ids) {
        try {
          await asignarEtiqueta.mutateAsync({ etiquetaId, concursoCphId })
          ok++
        } catch {
          // sigue con los demás
        }
      }
      toast.success(`Etiqueta "${nombre}" aplicada a ${ok} de ${ids.length} concurso(s)`)
      salirModoSeleccion()
    } catch {
      toast.error('No se pudo aplicar la etiqueta')
    } finally {
      setAplicandoMasivo(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Concursos CPH</h1>
          <div className="flex items-center gap-2">
            <label
              title={importando ? 'Importando...' : 'Importar CSV'}
              aria-label="Importar CSV"
              className={`btn-outline text-base cursor-pointer px-3 ${importando ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {importando ? '…' : '↑'}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportarCsv}
                disabled={importando}
              />
            </label>
            <button className="btn-outline" onClick={() => setShowFlujo(true)}>
              📋 Flujo del concurso
            </button>
            <button
              onClick={() => {
                setConFaltantes((v) => !v)
                setPage(1)
              }}
              className={`btn-outline text-sm ${conFaltantes ? 'bg-orange-100 border-orange-400 text-orange-800 font-semibold' : ''}`}
            >
              ⚠️ Con documentación faltante
            </button>
            <button
              onClick={() => (modoSeleccion ? salirModoSeleccion() : setModoSeleccion(true))}
              className={`btn-outline text-sm ${modoSeleccion ? 'bg-secondary/10 border-secondary text-secondary font-semibold' : ''}`}
            >
              🏷️ {modoSeleccion ? 'Cancelar selección' : 'Etiquetar varios'}
            </button>
          </div>
        </div>
        {importResult && (
          <div className="text-sm bg-green-50 border border-green-200 rounded px-3 py-2 text-green-800">
            Importación completada — {importResult.actualizados} actualizados,{' '}
            {importResult.creados} creados, {importResult.noEncontrados} no encontrados de{' '}
            {importResult.total} filas.
          </div>
        )}

        {modoSeleccion && (
          <div className="flex flex-wrap items-center gap-3 bg-secondary/5 border border-secondary/30 rounded px-3 py-2">
            <span className="text-sm font-medium text-gray-700">
              {seleccionados.size} concurso(s) seleccionado(s)
            </span>
            <input
              type="text"
              list="etiquetas-masivo"
              value={etiquetaMasiva}
              onChange={(e) => setEtiquetaMasiva(e.target.value)}
              placeholder="Etiqueta a aplicar (existente o nueva)"
              className="h-9 px-3 border border-gray-300 rounded text-sm min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            <datalist id="etiquetas-masivo">
              {catalogoEtiquetas.map((e) => (
                <option key={e.id} value={e.nombre} />
              ))}
            </datalist>
            <button
              onClick={aplicarEtiquetaMasiva}
              disabled={aplicandoMasivo || seleccionados.size === 0 || !etiquetaMasiva.trim()}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {aplicandoMasivo ? 'Aplicando...' : 'Aplicar etiqueta'}
            </button>
            <span className="text-xs text-gray-500">
              Tip: podés usar el filtro y "Seleccionar todos" para etiquetar por lote.
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por expediente, persona, observaciones..."
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <input
            type="text"
            placeholder="Especialidad..."
            value={especialidad}
            onChange={(e) => resetPage(setEspecialidad)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded min-w-[180px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
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
            value={estado}
            onChange={(e) => resetPage(setEstado)(e.target.value as '' | EstadoConcursoCph)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los estados</option>
            {Object.values(EstadoConcursoCph).map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e]}
              </option>
            ))}
          </select>
          <select
            value={subEstado}
            onChange={(e) => resetPage(setSubEstado)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los sub-estados</option>
            {SUB_ESTADO_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={subEstado3}
            onChange={(e) => resetPage(setSubEstado3)(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todas las etapas</option>
            {SUB_ESTADO_3_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando concursos...</p>}
        {isError && (
          <p className="p-6 text-sm text-danger">No se pudo cargar el listado de concursos CPH.</p>
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
                      {modoSeleccion && (
                        <th className="px-3 py-3 font-semibold w-8">
                          <input
                            type="checkbox"
                            checked={todasSeleccionadas}
                            onChange={toggleTodas}
                            aria-label="Seleccionar todos los visibles"
                            className="h-4 w-4 cursor-pointer align-middle"
                          />
                        </th>
                      )}
                      <th className="px-3 py-3 font-semibold w-8" title="Estado" />
                      <th className="px-4 py-3 font-semibold">Expediente de baja</th>
                      <th className="px-4 py-3 font-semibold">Cargo</th>
                      <th className="px-4 py-3 font-semibold">Hospital</th>
                      <th className="px-4 py-3 font-semibold">Etapa</th>
                      <th className="px-4 py-3 font-semibold">Sub-estado</th>
                      <th className="px-4 py-3 font-semibold">Etiquetas</th>
                      <th className="px-4 py-3 font-semibold">Últ. movimiento</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.data.map((c) => {
                      const dias = diasSinMovimiento(c.updatedAt)
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          {modoSeleccion && (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={seleccionados.has(c.id)}
                                onChange={() => toggleSeleccion(c.id)}
                                aria-label={`Seleccionar concurso ${c.eeConcurso ?? c.id}`}
                                className="h-4 w-4 cursor-pointer align-middle"
                              />
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${semaforoClass(c)}`}
                              title={semaforoLabel(c)}
                              aria-label={semaforoLabel(c)}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">
                            {c.eeBaja ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {c.concurso?.cargo?.codigo ?? c.concurso?.cargo?.literalPuesto ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                          <td className="px-4 py-3">
                            <EtapaStepper subEstado={c.subEstado} />
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.subEstado ?? '—'}</td>
                          <td className="px-4 py-3">
                            <EtiquetasControl
                              concursoCphId={c.id}
                              asignadas={c.etiquetas ?? []}
                              variant="compacto"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={diasBadgeClass(dias)}>
                              {dias === 0 ? 'Hoy' : `${dias} días`}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link to={`/concursos/cph/${c.id}/wizard`} className="btn-outline">
                              Ver
                            </Link>
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
      {showFlujo && <FlujoConcursoModal onClose={() => setShowFlujo(false)} />}
      {ToastUI}
    </div>
  )
}
