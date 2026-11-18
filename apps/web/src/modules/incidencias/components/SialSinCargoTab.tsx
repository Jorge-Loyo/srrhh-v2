import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useHospitales, useCodigosRegistro } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { etiquetaCarreraCR, ordenarCarrerasCR } from '@/shared/lib/carreraEtiqueta'
import { capitalizarEtiqueta } from '@/shared/lib/utils'
import { ComboBuscable } from '@/shared/components/selectores/ComboBuscable'
import {
  useIncidenciasPendientes,
  useVincularConcurso,
  useTransferencia,
  buscarConcursosParaPendiente,
  type PendienteItem,
  type ConcursoCandidato,
} from '../hooks/useIncidencias'

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

type Feedback = { tipo: 'ok' | 'error'; texto: string } | null

export function SialSinCargoTab({ busquedaInicial }: { busquedaInicial?: string }) {
  const { user } = useAuth()
  const puedeGestionar = can(user, 'incidencias', 'gestionar')

  const { data, isLoading, isError } = useIncidenciasPendientes()
  const { data: hospitales = [] } = useHospitales()
  const { data: codigos = [] } = useCodigosRegistro()
  const vincularConcurso = useVincularConcurso()
  const transferencia = useTransferencia()

  const [carrera, setCarrera] = useState('')
  const [sigla, setSigla] = useState('')
  const [busqueda, setBusqueda] = useState(busquedaInicial ?? '')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busyDiffId, setBusyDiffId] = useState<string | null>(null)
  const [confirmTransferencia, setConfirmTransferencia] = useState<PendienteItem | null>(null)

  // Modal de búsqueda/vinculación de concurso
  const [modalConcurso, setModalConcurso] = useState<PendienteItem | null>(null)
  const [concursoSearch, setConcursoSearch] = useState('')
  const [concursoResultados, setConcursoResultados] = useState<ConcursoCandidato[]>([])
  const [concursoLoading, setConcursoLoading] = useState(false)
  const concursoSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!modalConcurso) return
    if (concursoSearchRef.current) clearTimeout(concursoSearchRef.current)
    concursoSearchRef.current = setTimeout(async () => {
      setConcursoLoading(true)
      try {
        const resultados = await buscarConcursosParaPendiente(modalConcurso.diffId, concursoSearch)
        // Sugeridos primero (esSugerido), luego el resto
        resultados.sort((a, b) => {
          if (a.esSugerido && !b.esSugerido) return -1
          if (!a.esSugerido && b.esSugerido) return 1
          if (a.cuilCoincide && !b.cuilCoincide) return -1
          if (!a.cuilCoincide && b.cuilCoincide) return 1
          return 0
        })
        setConcursoResultados(resultados)
      } catch {
        setConcursoResultados([])
      } finally {
        setConcursoLoading(false)
      }
    }, 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concursoSearch, modalConcurso])

  function abrirModalConcurso(item: PendienteItem) {
    setConcursoSearch('')
    setConcursoResultados([])
    setModalConcurso(item)
  }

  function cerrarModalConcurso() {
    setModalConcurso(null)
    setConcursoSearch('')
    setConcursoResultados([])
  }

  async function ejecutar(diffId: string, accion: () => Promise<unknown>, okMsg: string) {
    setBusyDiffId(diffId)
    setFeedback(null)
    try {
      await accion()
      setFeedback({ tipo: 'ok', texto: okMsg })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setFeedback({ tipo: 'error', texto: err?.response?.data?.message ?? 'No se pudo completar la acción. Volvé a intentar.' })
    } finally {
      setBusyDiffId(null)
    }
  }

  const coincideCarrera = (v: { codigoDeRegistro: string | null }) =>
    !carrera || (v.codigoDeRegistro ?? '').trim() === carrera
  const q = norm(busqueda)
  const buscarActivo = q.length >= 2

  const siglasConPendientes = [...new Set((data?.pendientes ?? []).map((p) => p.valorNuevo.siglas).filter((s): s is string => !!s))]

  // Opciones de carrera: mismo patrón que Reportes (etiquetaCarreraCR + ordenarCarrerasCR).
  // Value = c.codigo.trim() para poder comparar con codigoDeRegistro del pendiente.
  // Filtradas a los CRs que realmente tienen pendientes; CR 22 excluido.
  const opcionesCarrera = useMemo(() => {
    const crsConPendientes = new Set(
      (data?.pendientes ?? []).map((p) => (p.valorNuevo.codigoDeRegistro ?? '').trim()).filter(Boolean)
    )
    crsConPendientes.delete('22')
    return ordenarCarrerasCR(codigos)
      .filter((c) => crsConPendientes.has(c.codigo.trim()))
      .map((c) => ({ value: c.codigo.trim(), label: etiquetaCarreraCR(c) }))
  }, [data, codigos])

  // Lookup para mostrar la etiqueta de carrera en la columna de la tabla.
  const etiquetaPorCr = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of codigos) m.set(c.codigo.trim(), etiquetaCarreraCR(c))
    return m
  }, [codigos])

  if (isLoading) return <p className="text-sm text-gray-400">Cargando cola de pendientes...</p>
  if (isError) return <p className="text-sm text-danger">No se pudo cargar la cola de Incidencias.</p>
  if (!data) return null

  const { pendientes, resumen } = data

  const pendientesFiltrados = pendientes.filter((p) => {
    if (!coincideCarrera(p.valorNuevo)) return false
    if (sigla && p.valorNuevo.siglas !== sigla) return false
    if (buscarActivo) {
      const v = p.valorNuevo
      return (
        norm(v.ayn).includes(q) ||
        norm(v.idSial).includes(q) ||
        norm(p.idSialRol).includes(q) ||
        norm(v.cuil).includes(q)
      )
    }
    return true
  })

  const total = (carrera !== '' || sigla !== '' || buscarActivo) ? pendientesFiltrados.length : resumen.total

  return (
    <>
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Nuevos ID SIAL que aparecieron en el padrón y no están vinculados a un cargo.
              Cada fila es una persona en un puesto que hay que gestionar mediante transferencia o concurso.
            </p>
            <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-orange-100 text-orange-800 font-bold text-sm">
              {resumen.total} pendientes
            </span>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              feedback.tipo === 'ok'
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-red-300 bg-red-50 text-red-700'
            }`}
          >
            {feedback.texto}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-sm flex-1">
            <span className="text-gray-700 font-medium">Buscar persona, id_sial o CUIL</span>
            <input
              type="search"
              placeholder="Nombre, id_sial o CUIL (mín. 2 caracteres)"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="block text-sm sm:w-80">
            <ComboBuscable
              modo="unico"
              label="Sigla"
              options={hospitales
                .filter((h) => siglasConPendientes.includes(h.sigla))
                .map((h) => ({ value: h.sigla, label: hospitalLabel(h) }))}
              selected={sigla ? [sigla] : []}
              onChange={(v) => setSigla(v[0] ?? '')}
              placeholder="Todas las siglas"
            />
          </div>
          <div className="block text-sm sm:w-80">
            <ComboBuscable
              modo="unico"
              label="Carrera"
              options={opcionesCarrera}
              selected={carrera ? [carrera] : []}
              onChange={(v) => setCarrera(v[0] ?? '')}
              placeholder="Todas las carreras"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {pendientesFiltrados.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              {carrera || sigla || buscarActivo
                ? 'No hay incidencias que coincidan con los filtros.'
                : 'No hay nuevos puestos sin cargo pendientes.'}
            </p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold rounded-tl-lg">ID SIAL</th>
                  <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold">Sigla</th>
                  <th className="px-4 py-3 font-semibold">Carrera</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  <th className="px-4 py-3 rounded-tr-lg" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendientesFiltrados.map((p) => {
                  const v = p.valorNuevo
                  const busy = busyDiffId === p.diffId
                  return (
                    <tr key={p.diffId} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{v.idSial ?? p.idSialRol}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{capitalizarEtiqueta(v.ayn)}</td>
                      <td className="px-4 py-3 text-gray-600">{v.siglas ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{etiquetaPorCr.get((v.codigoDeRegistro ?? '').trim()) ?? capitalizarEtiqueta(v.escalafon)}</td>
                      <td className="px-4 py-3 text-gray-600">{capitalizarEtiqueta(v.literalPuesto)}</td>
                      <td className="px-4 py-3 text-gray-600">{capitalizarEtiqueta(v.especialidad)}</td>
                      <td className="px-4 py-3 text-right">
                        {puedeGestionar && (
                          <div className="flex flex-col items-end gap-1.5">
                            {p.tieneBajaAsociada && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                ⚠ Baja asociada
                              </span>
                            )}
                            <div className="flex flex-wrap justify-end gap-1">
                              <button
                                className="text-xs px-2 py-1 rounded border font-medium transition-colors bg-green-50 border-green-300 text-green-700 hover:bg-green-100 disabled:opacity-50"
                                disabled={busy}
                                onClick={() => abrirModalConcurso(p)}
                              >
                                Vincular a concurso
                              </button>
                              <button
                                className="text-xs px-2 py-1 rounded border font-medium transition-colors bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                disabled={busy}
                                onClick={() => setConfirmTransferencia(p)}
                              >
                                Transferencia
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {confirmTransferencia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmTransferencia(null) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-primary text-lg font-bold text-gray-900">Confirmar transferencia</h2>
              <button onClick={() => setConfirmTransferencia(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-1">
              <p className="text-sm font-semibold text-gray-800">{confirmTransferencia.valorNuevo.ayn ?? '—'}</p>
              <p className="text-xs text-gray-500 font-mono">{confirmTransferencia.valorNuevo.cuil ?? '—'}</p>
              <p className="text-xs text-gray-600">
                {confirmTransferencia.valorNuevo.siglas} · {confirmTransferencia.valorNuevo.escalafon} · {confirmTransferencia.valorNuevo.literalPuesto}
              </p>
            </div>
            <p className="text-sm text-gray-600">
              Esta persona ya aparece en el padrón como transferencia activa. Se creará el cargo y quedará en estado <strong>vigente ocupado</strong>. La transferencia quedará registrada en <em>Alta de Cargos &gt; Transferencia</em>.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-outline" onClick={() => setConfirmTransferencia(null)}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const diffId = confirmTransferencia.diffId
                  setConfirmTransferencia(null)
                  await ejecutar(
                    diffId,
                    () => transferencia.mutateAsync(diffId),
                    'Transferencia confirmada. Cargo creado como vigente ocupado.',
                  )
                }}
              >
                Confirmar transferencia
              </button>
            </div>
          </div>
        </div>
      )}

      {modalConcurso && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModalConcurso() }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-primary text-lg font-bold text-gray-900">Vincular a concurso CPH</h2>
              <button onClick={cerrarModalConcurso} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Buscá el concurso al que pertenece esta designación. El cargo tomará el código del
              concurso — no se generará uno nuevo.
            </p>
            <input
              autoFocus
              type="search"
              placeholder="Buscar por puesto, hospital, código de cargo..."
              value={concursoSearch}
              onChange={(e) => setConcursoSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-200">
              {concursoLoading && <p className="p-4 text-sm text-gray-400 text-center">Buscando...</p>}
              {!concursoLoading && concursoResultados.length === 0 && (
                <p className="p-4 text-sm text-gray-400 text-center">
                  {concursoSearch ? 'Sin resultados para esa búsqueda.' : 'Cargando concursos del hospital...'}
                </p>
              )}
              {!concursoLoading &&
                concursoResultados.map((c) => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      const diffId = modalConcurso.diffId
                      cerrarModalConcurso()
                      await ejecutar(
                        diffId,
                        () => vincularConcurso.mutateAsync({ diffId, concursoCphId: c.id }),
                        'Cargo vinculado al concurso.',
                      )
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      c.esSugerido ? 'bg-green-50 border-l-4 border-l-green-400' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {c.esSugerido && (
                          <p className="text-[10px] font-semibold text-green-700 mb-0.5">
                            {c.cuilCoincide ? '✓ Match perfecto — mismo CUIL, puesto y carrera' : '↑ Sugerido — coincide puesto y carrera'}
                          </p>
                        )}
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {c.codigoCargo ?? <span className="text-gray-400 font-normal">Sin código</span>}{' '}
                          <span className="font-normal text-gray-600">{c.literalPuesto}</span>
                        </p>
                        {c.especialidad && (
                          <p className="text-xs text-indigo-800 font-medium mt-0.5 truncate">{c.especialidad}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.hospital}
                          {c.eeConcurso && <> · {c.eeConcurso}</>}
                          {c.expediente && <> · Exp: {c.expediente}</>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            c.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {c.estado}
                        </span>
                        {!c.estaCompleto && (
                          <span className="text-[10px] text-orange-800 font-medium">⚠ Pendiente de completar</span>
                        )}
                        {c.yaDesignado && <span className="text-[10px] text-blue-600 font-medium">Ya tiene designado</span>}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
            <div className="flex justify-end pt-1">
              <button className="btn-outline" onClick={cerrarModalConcurso}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
