import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TipoDiff } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useAprobarSnapshot, useRechazarSnapshot, useSnapshotDiff, useDiagnosticoNuevos, useCamposModificados } from '../hooks/usePadron'
import { apiClient } from '@/shared/lib/api-client'

const TABS: { tipo: TipoDiff; label: string }[] = [
  { tipo: TipoDiff.NUEVO, label: 'Nuevos cargos' },
  { tipo: TipoDiff.MODIFICADO, label: 'Modificados' },
  { tipo: TipoDiff.ELIMINADO, label: 'Bajas' },
]

const CAMPO_LABELS: Record<string, string> = {
  especialidad: 'Especialidad',
  estado: 'Estado',
  unificador_de_puestos: 'Unificador de puestos',
  codigo_repa: 'Código REPA',
  descripcion_repa: 'Descripción REPA',
  agrupador: 'Agrupador',
  situacion_de_revista: 'Situación de revista',
  codigo_jefaturas: 'Código jefaturas',
  codigo_de_registro: 'Código de registro',
  jefe_escalafon: 'Jefe escalafón',
  cod_situacion: 'Cód. situación',
  literal_puesto: 'Literal puesto',
}

type SubTabNuevos = 'ingreso' | 'cambio_rol'

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

interface RegistroPersona {
  id_sial?: string
  ayn?: string
  siglas?: string
  escalafon?: string
  literal_puesto?: string
  especialidad?: string
}

function parseRegistro(json: string | null): RegistroPersona {
  if (!json) return {}
  try { return JSON.parse(json) } catch { return {} }
}

export function PadronDiffPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<TipoDiff>(TipoDiff.NUEVO)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [modalAprobarTodos, setModalAprobarTodos] = useState(false)
  const [subTabNuevos, setSubTabNuevos] = useState<SubTabNuevos>('ingreso')
  const [subTabEliminados, setSubTabEliminados] = useState<'con_persona' | 'en_validacion' | 'sin_persona'>('con_persona')
  const [campoFiltro, setCampoFiltro] = useState<string | null>(null)
  const [camposExpanded, setCamposExpanded] = useState(false)
  const limit = 50

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Query base: siempre activo, da snapshot + summary para el encabezado y tabs
  const { data: baseData, isError } = useSnapshotDiff(snapshotId, { page: 1, limit: 1 })

  // Query de tabla: en modificados espera a tener campoFiltro para no traer todo mezclado
  const { data: diffsData, isLoading: isDiffsLoading } = useSnapshotDiff(snapshotId, {
    page,
    limit,
    tipo: tab,
    q: debouncedSearch || undefined,
    soloPendientes: soloPendientes || undefined,
    campo: (tab === TipoDiff.MODIFICADO && campoFiltro) ? campoFiltro : undefined,
    clasificacionEliminado: tab === TipoDiff.ELIMINADO ? subTabEliminados : undefined,
  }, {
    enabled: tab !== TipoDiff.MODIFICADO || !!campoFiltro,
  })

  const aprobar = useAprobarSnapshot()
  const rechazar = useRechazarSnapshot()
  const diagnostico = useDiagnosticoNuevos(snapshotId, tab === TipoDiff.NUEVO)
  const camposModificados = useCamposModificados(snapshotId, tab === TipoDiff.MODIFICADO)

  // Cuando cargan los campos, seleccionar el primero (el de más cambios)
  useEffect(() => {
    if (camposModificados.data && camposModificados.data.length > 0) {
      setCampoFiltro((prev) => prev ?? camposModificados.data![0]!.campo)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camposModificados.data])

  const ingresosSet = new Set(
    diagnostico.data?.detalle.filter((d) => d.clasificacion === 'nuevo_de_0').map((d) => d.idSialRol) ?? []
  )
  const cambioRolSet = new Set(
    diagnostico.data?.detalle.filter((d) => d.clasificacion === 'nuevo_rol').map((d) => d.idSialRol) ?? []
  )

  function optimisticDecision(diffId: string, decision: boolean) {
    queryClient.setQueriesData(
      { queryKey: ['snapshot-diff', snapshotId] },
      (old: any) => {
        if (!old) return old
        return {
          ...old,
          diffs: {
            ...old.diffs,
            data: old.diffs.data.map((d: any) => d.id === diffId ? { ...d, aprobado: decision } : d),
          },
          summary: {
            ...old.summary,
            nuevosPendientes: Math.max(0, (old.summary.nuevosPendientes ?? 0) - 1),
            nuevosRechazados: decision ? old.summary.nuevosRechazados : (old.summary.nuevosRechazados ?? 0) + 1,
          },
        }
      }
    )
  }

  const aprobarDiff = useMutation({
    mutationFn: (diffId: string) => apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/diffs/${diffId}/aprobar`),
    onMutate: (diffId) => optimisticDecision(diffId, true),
    onSuccess: () => { if (soloPendientes) queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }) },
    onError: () => queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }),
  })

  const transferenciaDiff = useMutation({
    mutationFn: (diffId: string) => apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/diffs/${diffId}/transferencia`),
    onMutate: (diffId) => optimisticDecision(diffId, true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }),
    onError: () => queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }),
  })

  const rechazarDiff = useMutation({
    mutationFn: (diffId: string) => apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/diffs/${diffId}/rechazar`),
    onMutate: (diffId) => optimisticDecision(diffId, false),
    onSuccess: () => { if (soloPendientes) queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }) },
    onError: () => queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] }),
  })

  const aprobarTodos = useMutation({
    mutationFn: () => apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/diffs/aprobar-todos`),
    onSuccess: () => {
      setModalAprobarTodos(false)
      queryClient.invalidateQueries({ queryKey: ['snapshot-diff', snapshotId] })
    },
  })

  const puedeDecidir = can(user, 'padron', 'aprobar_padron')

  function cambiarTab(nuevoTab: TipoDiff) {
    setTab(nuevoTab)
    setPage(1)
    setSearch('')
    setSoloPendientes(false)
    setSubTabNuevos('ingreso')
    setCampoFiltro(null)
    setCamposExpanded(false)
    setSubTabEliminados('con_persona')
  }

  async function handleAprobar() {
    if (!snapshotId) return
    await aprobar.mutateAsync(snapshotId)
    navigate('/padron')
  }

  async function handleRechazar() {
    if (!snapshotId) return
    if (!window.confirm('¿Rechazar este padrón? Los diffs no se aplicarán a la base de datos.')) return
    await rechazar.mutateAsync(snapshotId)
    navigate('/padron')
  }

  if (!baseData) return <p className="text-sm text-gray-400">Cargando diferencias del padrón...</p>
  if (isError) return <p className="text-sm text-danger">No se pudo cargar el diff de este snapshot.</p>

  const { snapshot, summary } = baseData
  const diffs = diffsData?.diffs
  const nuevosPendientes = summary.nuevosPendientes ?? 0
  const nuevosRechazados = summary.nuevosRechazados ?? 0
  const hayPendientes = nuevosPendientes > 0

  return (
    <>
      <div className="space-y-6">

        {/* Encabezado */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-primary text-xl font-bold text-gray-900">
                Padrón — {snapshot.fechaAsignada}
              </h1>
              <p className="text-sm text-gray-500">
                {snapshot.filename} · {snapshot.totalRegistros} registros procesados
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={
                snapshot.estado === 'pendiente' ? 'badge-warning'
                  : snapshot.estado === 'aprobado' ? 'badge-success'
                  : 'badge-danger'
              }>
                {ESTADO_LABELS[snapshot.estado] ?? snapshot.estado}
              </span>
              {snapshot.estado === 'pendiente' && puedeDecidir && (
                <div className="flex gap-2">
                  <button className="btn-outline" onClick={handleRechazar} disabled={aprobar.isPending || rechazar.isPending}>
                    Rechazar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleAprobar}
                    disabled={aprobar.isPending || rechazar.isPending || hayPendientes}
                    title={hayPendientes ? `Hay ${nuevosPendientes} cargo(s) nuevo(s) sin decisión` : undefined}
                  >
                    {aprobar.isPending ? 'Aprobando...' : 'Aprobar'}
                  </button>
                </div>
              )}
            </div>
          </div>
          {(aprobar.isError || rechazar.isError) && (
            <p className="text-sm text-danger mt-2">No se pudo completar la operación. Volvé a intentar en unos segundos.</p>
          )}
        </div>

        {/* Tabs principales */}
        <div className="border-b border-gray-200 flex gap-1">
          {TABS.map((t) => {
            const count = t.tipo === 'nuevo' ? summary.nuevos : t.tipo === 'modificado' ? summary.modificados : summary.eliminados
            const badge = t.tipo === 'nuevo' && (nuevosPendientes > 0 || nuevosRechazados > 0)
              ? (
                <span className="ml-1 inline-flex items-center gap-1">
                  {nuevosPendientes > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
                      {nuevosPendientes} pendientes
                    </span>
                  )}
                  {nuevosRechazados > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold">
                      {nuevosRechazados} sin código
                    </span>
                  )}
                </span>
              ) : null
            return (
              <button
                key={t.tipo}
                onClick={() => cambiarTab(t.tipo)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t.tipo ? 'border-primary text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label} <span className="text-gray-400">({count})</span>{badge}
              </button>
            )
          })}
        </div>

        {/* Sub-tabs: Nuevos cargos */}
        {tab === TipoDiff.NUEVO && (
          <div className="flex gap-1 border-b border-gray-100 bg-gray-50 px-4">
            {([
              { key: 'ingreso' as SubTabNuevos, label: 'Ingreso', count: ingresosSet.size },
              { key: 'cambio_rol' as SubTabNuevos, label: 'Cambio de rol', count: cambioRolSet.size },
            ]).map((st) => (
              <button
                key={st.key}
                onClick={() => { setSubTabNuevos(st.key); setPage(1) }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  subTabNuevos === st.key ? 'border-primary text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {st.label}
                {diagnostico.data
                  ? <span className="ml-1 text-gray-400">({st.count})</span>
                  : <span className="ml-1 text-gray-300 text-xs">...</span>
                }
              </button>
            ))}
          </div>
        )}

        {/* Sub-tabs: Modificados por campo */}
        {tab === TipoDiff.MODIFICADO && camposModificados.data && camposModificados.data.length > 0 && (() => {
          const VISIBLE = 5
          const visible = camposExpanded ? camposModificados.data : camposModificados.data.slice(0, VISIBLE)
          const hayMas = camposModificados.data.length > VISIBLE
          return (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-2">
              {visible.map((c) => (
                <button
                  key={c.campo}
                  onClick={() => { setCampoFiltro(c.campo); setPage(1) }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                    campoFiltro === c.campo
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {CAMPO_LABELS[c.campo] ?? c.campo}
                  <span className={`ml-1.5 text-xs ${campoFiltro === c.campo ? 'text-white/80' : 'text-gray-400'}`}>
                    {c.cantidad}
                  </span>
                </button>
              ))}
              {hayMas && (
                <button
                  onClick={() => setCamposExpanded((v) => !v)}
                  className="px-3 py-1.5 text-sm text-primary font-medium hover:underline"
                >
                  {camposExpanded ? 'Ver menos ↑' : `+${camposModificados.data!.length - VISIBLE} más ↓`}
                </button>
              )}
            </div>
          )
        })()}

        {tab === TipoDiff.ELIMINADO && (() => {
          const SUBTABS_ELIM = [
            {
              key: 'con_persona' as const,
              label: 'Con persona activa',
              count: summary.eliminadosConPersona,
              color: 'text-red-600',
              borderColor: 'border-red-200 bg-red-50 text-red-700',
              icon: '⚠',
              leyenda: 'El cargo existía en el padrón vigente con una persona asignada y no aparece en el archivo nuevo. Al aprobar se cerrará la ocupación, el cargo pasará a validación vacante y, si la persona no tiene otros cargos vigentes, quedará inactiva.',
            },
            {
              key: 'en_validacion' as const,
              label: 'En validación vacante',
              count: summary.eliminadosEnValidacion,
              color: 'text-orange-600',
              borderColor: 'border-orange-200 bg-orange-50 text-orange-700',
              icon: 'ℹ',
              leyenda: 'El cargo ya estaba en estado «validación vacante» desde un padrón anterior (la persona ya había sido dada de baja). Como tampoco aparece en el nuevo archivo, se confirma la baja: el cargo pasará a no vigente.',
            },
            {
              key: 'sin_persona' as const,
              label: 'Sin persona / vacante',
              count: summary.eliminadosSinPersona,
              color: 'text-gray-500',
              borderColor: 'border-gray-200 bg-gray-50 text-gray-500',
              icon: '○',
              leyenda: 'El cargo figura en la base de datos sin persona asignada (vacante) o ya marcado como no vigente, y no aparece en el archivo nuevo. No hay impacto sobre personas; al aprobar el cargo pasará a no vigente si aún no lo estaba.'
            },
          ]
          const activo = SUBTABS_ELIM.find((s) => s.key === subTabEliminados)!
          return (
            <>
              <div className="flex gap-1 border-b border-gray-100 bg-gray-50 px-4">
                {SUBTABS_ELIM.map((st) => (
                  <button
                    key={st.key}
                    onClick={() => { setSubTabEliminados(st.key); setPage(1) }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      subTabEliminados === st.key
                        ? `border-primary ${st.color} font-semibold`
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {st.label} <span className="text-gray-400">({st.count})</span>
                  </button>
                ))}
              </div>
              <div className={`mx-4 mt-3 mb-1 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${activo.borderColor}`}>
                <span className="mt-0.5 shrink-0">{activo.icon}</span>
                <span>{activo.leyenda}</span>
              </div>
            </>
          )
        })()}

        {/* Contenido */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">

          {/* Buscador + acciones */}
          <div className="px-4 pt-4 pb-2 flex items-center gap-3">
            <input
              type="search"
              placeholder="Buscar por ID SIAL, CUIL o DNI..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {tab === 'nuevo' && nuevosPendientes > 0 && snapshot.estado === 'pendiente' && puedeDecidir && (
              <button
                onClick={() => setModalAprobarTodos(true)}
                className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
              >
                Aprobar todos ({nuevosPendientes})
              </button>
            )}
            {tab === 'nuevo' && snapshot.estado === 'pendiente' && nuevosPendientes > 0 && (
              <button
                onClick={() => { setSoloPendientes((v) => !v); setPage(1) }}
                className={`text-sm px-3 py-1.5 rounded-md border font-medium transition-colors ${
                  soloPendientes
                    ? 'bg-orange-100 border-orange-300 text-orange-700'
                    : 'border-gray-300 text-gray-500 hover:border-gray-400'
                }`}
              >
                {soloPendientes ? `Solo pendientes (${nuevosPendientes})` : `Todos (${summary.nuevos})`}
              </button>
            )}
          </div>

          {/* Spinner mientras carga la tabla de modificados */}
          {tab === TipoDiff.MODIFICADO && (!campoFiltro || isDiffsLoading) && (
            <p className="p-6 text-sm text-gray-400 text-center">Cargando...</p>
          )}

          {/* Vacío */}
          {diffs && diffs.data.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">
              Sin registros para este filtro.
            </p>
          )}

          {/* Tabla: Nuevos / Eliminados */}
          {diffs && diffs.data.length > 0 && (tab === 'nuevo' || tab === 'eliminado') && (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold rounded-tl-lg">ID SIAL</th>
                  <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Escalafón</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  {tab === 'eliminado' && <th className="px-4 py-3 font-semibold">Código cargo</th>}
                  {tab === 'nuevo' && <th className="px-4 py-3 font-semibold">Código a generar</th>}
                  <th className="px-4 py-3 rounded-tr-lg" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diffs.data
                  .filter((d) => {
                    if (tab !== 'nuevo' || !diagnostico.data) return true
                    return subTabNuevos === 'ingreso' ? ingresosSet.has(d.idSialRol) : cambioRolSet.has(d.idSialRol)
                  })
                  .map((d) => {
                    const r = parseRegistro(tab === 'nuevo' ? d.valorNuevo : d.valorAnterior)
                    const isPending = d.aprobado === null
                    const isRechazado = d.aprobado === false
                    const isAprobado = d.aprobado === true
                    return (
                      <tr key={d.id} className={isPending ? 'bg-orange-50' : isRechazado ? 'bg-gray-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{r.id_sial ?? d.idSialRol}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {tab === 'eliminado' ? (d.apellidoNombre ?? <span className="text-gray-300">—</span>) : (r.ayn ?? '—')}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.siglas ?? d.siglas ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{r.escalafon ?? d.escalafon ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{r.literal_puesto ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{r.especialidad ?? '—'}</td>
                        {tab === 'eliminado' && (
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">
                            {d.codigoCargo ?? <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        {tab === 'nuevo' && (
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                            {isAprobado
                              ? <span className="text-green-600 font-semibold">✓ Asignado</span>
                              : isRechazado
                                ? <span className="text-gray-400">⚠ Sin asignar</span>
                                : d.codigoPreview ? <span className="text-blue-700">{d.codigoPreview}</span> : '—'
                            }
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          {tab === 'nuevo' && snapshot.estado === 'pendiente' && puedeDecidir && (
                            isAprobado || isRechazado
                              ? (
                                <span className={`text-xs font-semibold ${isAprobado ? 'text-green-600' : 'text-gray-400'}`}>
                                  {isAprobado ? '✓ Aprobado' : '✕ Sin código'}
                                </span>
                              )
                              : (
                                <div className="flex gap-1 justify-end">
                                  <button className="btn-primary text-xs px-3 py-1" disabled={aprobarDiff.isPending || rechazarDiff.isPending || transferenciaDiff.isPending} onClick={() => aprobarDiff.mutate(d.id)}>
                                    Aprobar
                                  </button>
                                  <button
                                    className="text-xs px-3 py-1 rounded border font-medium transition-colors bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                                    disabled={aprobarDiff.isPending || rechazarDiff.isPending || transferenciaDiff.isPending}
                                    onClick={() => transferenciaDiff.mutate(d.id)}
                                  >
                                    Transferencia
                                  </button>
                                  <button className="btn-outline text-xs px-3 py-1" disabled={aprobarDiff.isPending || rechazarDiff.isPending || transferenciaDiff.isPending} onClick={() => rechazarDiff.mutate(d.id)}>
                                    Sin código
                                  </button>
                                </div>
                              )
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}

          {/* Tabla: Modificados */}
          {diffs && diffs.data.length > 0 && tab === 'modificado' && campoFiltro && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold">ID SIAL / Rol</th>
                  <th className="px-4 py-3 font-semibold">{CAMPO_LABELS[campoFiltro] ?? campoFiltro} — antes</th>
                  <th className="px-4 py-3 font-semibold">{CAMPO_LABELS[campoFiltro] ?? campoFiltro} — después</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diffs.data.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{d.apellidoNombre ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{d.idSialRol}</td>
                    <td className="px-4 py-3 text-gray-500">{d.valorAnterior || <span className="text-gray-300">vacío</span>}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{d.valorNuevo || <span className="text-gray-300">vacío</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Paginación */}
          {diffs && diffs.meta.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>Página {diffs.meta.page} de {diffs.meta.pages} — {diffs.meta.total} en total</span>
              <div className="flex gap-2">
                <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                <button className="btn-outline" disabled={page >= diffs.meta.pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal aprobar todos */}
      {modalAprobarTodos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !aprobarTodos.isPending) setModalAprobarTodos(false) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="font-primary text-lg font-bold text-gray-900">Aprobar todos los pendientes</h2>
            <p className="text-sm text-gray-600">
              Se generará un código para cada uno de los{' '}
              <span className="font-semibold text-gray-900">{nuevosPendientes} cargos pendientes</span>.
              Esta acción no se puede deshacer.
            </p>
            {aprobarTodos.isError && <p className="text-sm text-danger">Ocurrió un error. Volvé a intentar.</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-outline" onClick={() => setModalAprobarTodos(false)} disabled={aprobarTodos.isPending}>Cancelar</button>
              <button className="btn-primary" onClick={() => aprobarTodos.mutate()} disabled={aprobarTodos.isPending}>
                {aprobarTodos.isPending ? 'Aprobando...' : `Aprobar ${nuevosPendientes} cargos`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
