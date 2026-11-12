import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TipoDiff } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useAprobarSnapshot, useRechazarSnapshot, useSnapshotDiff, useDiagnosticoNuevos, useCamposModificados, useValidacionesPreview } from '../hooks/usePadron'

// La columna `campo` del diff usa prefijos para separar vistas sin tocar el
// enum TipoDiff: 'completado:<col>' sobre tipo='modificado' y 'baja_previa'
// sobre tipo='eliminado'. La pestaña Completados reusa tipo='modificado'.
type TabKey = TipoDiff | 'completado'

const TABS: { key: TabKey; label: string }[] = [
  { key: TipoDiff.NUEVO, label: 'Nuevos id_sial' },
  { key: TipoDiff.MODIFICADO, label: 'Modificados' },
  { key: 'completado', label: 'Completados' },
  { key: TipoDiff.ELIMINADO, label: 'Bajas' },
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
  cargo_desde: 'Cargo desde',
  cargo_hasta: 'Cargo hasta',
}

// Despoja el prefijo 'completado:' para resolver el label legible del campo.
function labelCampo(campo: string): string {
  const base = campo.replace(/^completado:/, '')
  return CAMPO_LABELS[base] ?? campo
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

  const [tab, setTab] = useState<TabKey>(TipoDiff.NUEVO)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [subTabNuevos, setSubTabNuevos] = useState<SubTabNuevos>('ingreso')
  // Encabezado activo dentro de la pestaña Bajas: 'nuevas' = bajas nuevas de la
  // semana (campo IS NULL); 'previas' = ya estaban en baja (campo='baja_previa',
  // con dos sub-pestañas en_validacion/sin_persona).
  const [headerEliminado, setHeaderEliminado] = useState<'nuevas' | 'previas'>('nuevas')
  const [subTabEliminados, setSubTabEliminados] = useState<'en_validacion' | 'sin_persona'>('en_validacion')
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
  // La pestaña determina el tipo y los filtros del diff:
  //  - Modificados: tipo='modificado', soloCompletados:false, campo=<sub-tab>.
  //  - Completados: tipo='modificado', soloCompletados:true (reusa el render).
  //  - Bajas: tipo='eliminado'; soloBajasNuevas=true para "bajas nuevas", o
  //    campo='baja_previa' + clasificacionEliminado para "ya estaban en baja".
  const tipoQuery: TipoDiff = tab === 'completado' ? TipoDiff.MODIFICADO : tab
  const { data: diffsData, isLoading: isDiffsLoading } = useSnapshotDiff(snapshotId, {
    page,
    limit,
    tipo: tipoQuery,
    q: debouncedSearch || undefined,
    soloPendientes: soloPendientes || undefined,
    soloCompletados: tab === 'completado' ? true : (tab === TipoDiff.MODIFICADO ? false : undefined),
    campo: (tab === TipoDiff.MODIFICADO && campoFiltro) ? campoFiltro : undefined,
    soloBajasNuevas: tab === TipoDiff.ELIMINADO && headerEliminado === 'nuevas' ? true : undefined,
    clasificacionEliminado: tab === TipoDiff.ELIMINADO && headerEliminado === 'previas' ? subTabEliminados : undefined,
  }, {
    enabled: tab !== TipoDiff.MODIFICADO || !!campoFiltro,
  })

  const aprobar = useAprobarSnapshot()
  const rechazar = useRechazarSnapshot()
  const diagnostico = useDiagnosticoNuevos(snapshotId, tab === TipoDiff.NUEVO)
  const camposModificados = useCamposModificados(snapshotId, tab === TipoDiff.MODIFICADO)
  // Preview de concursos que quedarían validados al aprobar este padrón.
  const validaciones = useValidacionesPreview(snapshotId, !!baseData && baseData.snapshot.estado === 'pendiente')

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
  // La pestaña "Nuevos id_sial" es solo-lectura: las decisiones (crear cargo /
  // concurso / transferencia / sin código) se tomaron fuera de la aprobación,
  // en el módulo "Incidencias". Acá solo se audita qué trae el padrón.
  // Mapa idSialRol → código del concurso abierto (si existe), para el indicador
  // informativo "genera concurso / sin concurso".
  const concursoInfoMap = new Map(
    (diagnostico.data?.detalle ?? [])
      .filter((d) => d.concursoCphId)
      .map((d) => [d.idSialRol, d.concursoCodigo])
  )

  const puedeDecidir = can(user, 'padron', 'aprobar_padron')

  function cambiarTab(nuevoTab: TabKey) {
    setTab(nuevoTab)
    setPage(1)
    setSearch('')
    setSoloPendientes(false)
    setSubTabNuevos('ingreso')
    setCampoFiltro(null)
    setCamposExpanded(false)
    setHeaderEliminado('nuevas')
    setSubTabEliminados('en_validacion')
  }

  async function handleAprobar() {
    if (!snapshotId) return
    // Guarda contra padrón parcial: si el padrón vino sospechosamente chico
    // (advertenciaTamano presente), exigir confirmación explícita del operador
    // y recién ahí pasar el override al endpoint.
    const advertencia = baseData?.snapshot.advertenciaTamano
    let overrideRatioTamano = false
    if (advertencia) {
      if (!window.confirm(`${advertencia}\n\n¿Aprobar igual este padrón?`)) return
      overrideRatioTamano = true
    }
    // Guarda contra padrón sin la baja SIAL de la semana: a diferencia del ratio
    // (que se persiste al procesar), esta se evalúa al aprobar y el backend
    // responde 409 con la advertencia. Se intenta sin override; ante el 409 se
    // muestra el mensaje y, si el operador confirma, se reintenta con el flag.
    try {
      await aprobar.mutateAsync({ snapshotId, overrideRatioTamano })
    } catch (e: any) {
      const status = e?.response?.status
      const msg = e?.response?.data?.message ?? ''
      if (status === 409 && msg) {
        if (!window.confirm(`${msg}\n\n¿Aprobar igual este padrón?`)) return
        await aprobar.mutateAsync({ snapshotId, overrideRatioTamano, overrideBajaSial: true })
      } else {
        return
      }
    }
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
                    disabled={aprobar.isPending || rechazar.isPending}
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
          {/* Guarda contra padrón parcial: advertencia de padrón chico. Visible
              junto al botón Aprobar; al aprobar se exige confirmar el override. */}
          {snapshot.estado === 'pendiente' && snapshot.advertenciaTamano && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>
                <strong>Posible padrón parcial.</strong> {snapshot.advertenciaTamano}
                {snapshot.ratioTamano != null && (
                  <span className="ml-1 text-red-600">
                    (ratio {(snapshot.ratioTamano * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Concursos que pasarán a validados (triangulación con el padrón) */}
        {snapshot.estado === 'pendiente' &&
          validaciones.data &&
          validaciones.data.detalle.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-600">✅</span>
                <h2 className="font-primary text-sm font-bold text-gray-900">
                  Concursos que pasarán a validados
                </h2>
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                  {validaciones.data.resumen.validables}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Estos concursos triangulan con un cargo nuevo del padrón (por CUIL, carrera y
                especialidad). Se marcan como validados al aprobar y vincular el cargo en la
                pestaña «Nuevos».
              </p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {validaciones.data.detalle.map((v) => (
                  <div
                    key={v.diffId}
                    className="px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                  >
                    <span className="font-mono text-xs text-gray-500">{v.idSialRol}</span>
                    <span className="font-medium text-gray-800">{v.personaNombre}</span>
                    <span className="text-xs text-gray-400">CUIL {v.cuil}</span>
                    {v.concursoCodigo && (
                      <span className="text-xs text-gray-500">
                        Concurso <span className="font-mono">{v.concursoCodigo}</span>
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1.5">
                      {v.yaValidado ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                          Ya validado
                        </span>
                      ) : v.validable ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                          Se validará
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Revisar
                        </span>
                      )}
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          v.carreraCoincide
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        Carrera {v.carreraCoincide ? '✓' : '✗'}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          v.especialidadCoincide
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        Especialidad {v.especialidadCoincide ? '✓' : '✗'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Tabs principales */}
        <div className="border-b border-gray-200 flex gap-1">
          {TABS.map((t) => {
            const count = t.key === 'nuevo' ? summary.nuevos
              : t.key === 'modificado' ? summary.modificados
              : t.key === 'completado' ? summary.completados
              : summary.eliminados
            const badge = t.key === 'nuevo' && (nuevosPendientes > 0 || nuevosRechazados > 0)
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
                key={t.key}
                onClick={() => cambiarTab(t.key)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t.key ? 'border-primary text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label} <span className="text-gray-400">({count})</span>{badge}
              </button>
            )
          })}
        </div>

        {/* Sub-tabs: Nuevos cargos — solo cuando está pendiente (el diagnóstico solo carga pendientes) */}
        {tab === TipoDiff.NUEVO && snapshot.estado !== 'aprobado' && (
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
                  {labelCampo(c.campo)}
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

        {/* Leyenda: Completados — datos que el padrón completó (antes vacíos) */}
        {tab === 'completado' && (
          <div className="mx-4 mt-3 mb-1 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <span className="mt-0.5 shrink-0">ℹ</span>
            <span>Datos que el padrón completó (antes vacíos). No son cambios: se escribirán al aprobar.</span>
          </div>
        )}

        {tab === TipoDiff.ELIMINADO && (() => {
          // Encabezados de nivel superior, derivados solo de `campo` (no de la
          // antigua clasificación con_persona).
          const HEADERS = [
            {
              key: 'nuevas' as const,
              label: 'Bajas nuevas de la semana',
              count: summary.bajasNuevas,
              color: 'text-red-600',
            },
            {
              key: 'previas' as const,
              label: 'Ya estaban en baja',
              count: summary.bajasPrevias,
              color: 'text-orange-600',
            },
          ]
          // Leyenda del encabezado "Bajas nuevas" (reciclada de la antigua
          // sub-pestaña con_persona).
          const LEYENDA_NUEVAS = {
            borderColor: 'border-red-200 bg-red-50 text-red-700',
            icon: '⚠',
            texto: 'El cargo existía en el padrón vigente con una persona asignada y no aparece en el archivo nuevo. Al aprobar se cerrará la ocupación, el cargo pasará a validación vacante y, si la persona no tiene otros cargos vigentes, quedará inactiva.',
          }
          // Sub-pestañas internas de "Ya estaban en baja".
          const SUBTABS_PREVIAS = [
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
          const subActivo = SUBTABS_PREVIAS.find((s) => s.key === subTabEliminados)!
          return (
            <>
              <div className="flex gap-1 border-b border-gray-100 bg-gray-50 px-4">
                {HEADERS.map((h) => (
                  <button
                    key={h.key}
                    onClick={() => { setHeaderEliminado(h.key); setSubTabEliminados('en_validacion'); setPage(1) }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      headerEliminado === h.key
                        ? `border-primary ${h.color} font-semibold`
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {h.label} <span className="text-gray-400">({h.count})</span>
                  </button>
                ))}
              </div>

              {headerEliminado === 'nuevas' && (
                <div className={`mx-4 mt-3 mb-1 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${LEYENDA_NUEVAS.borderColor}`}>
                  <span className="mt-0.5 shrink-0">{LEYENDA_NUEVAS.icon}</span>
                  <span>{LEYENDA_NUEVAS.texto}</span>
                </div>
              )}

              {headerEliminado === 'previas' && (
                <>
                  <div className="flex gap-1 border-b border-gray-100 bg-gray-50/60 px-4">
                    {SUBTABS_PREVIAS.map((st) => (
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
                  <div className={`mx-4 mt-3 mb-1 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${subActivo.borderColor}`}>
                    <span className="mt-0.5 shrink-0">{subActivo.icon}</span>
                    <span>{subActivo.leyenda}</span>
                  </div>
                </>
              )}
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
          </div>

          {/* Aviso: los id_sial nuevos ya no se deciden acá; se gestionan en el
              módulo "Incidencias" después de aprobar el padrón. */}
          {tab === 'nuevo' && (
            <div className="mx-4 mt-1 mb-2 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              <span className="mt-0.5 shrink-0">ℹ</span>
              <span>
                Estos id_sial se resuelven en{' '}
                <button
                  type="button"
                  onClick={() => navigate('/incidencias')}
                  className="font-semibold underline hover:text-blue-900"
                >
                  Incidencias
                </button>{' '}
                después de aprobar. Esta vista es solo de auditoría.
              </span>
            </div>
          )}

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
                  <th className="px-4 py-3 font-semibold">Carrera</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  {tab === 'eliminado' && <th className="px-4 py-3 font-semibold rounded-tr-lg">Código cargo</th>}
                  {tab === 'nuevo' && <th className="px-4 py-3 font-semibold rounded-tr-lg">Concurso</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diffs.data
                  .filter((d) => {
                    if (tab !== 'nuevo' || !diagnostico.data) return true
                    // Si el snapshot está aprobado no hay diagnóstico (solo carga pendientes) — mostrar todos
                    if (snapshot.estado === 'aprobado') return true
                    return subTabNuevos === 'ingreso' ? ingresosSet.has(d.idSialRol) : cambioRolSet.has(d.idSialRol)
                  })
                  .map((d) => {
                    const r = parseRegistro(tab === 'nuevo' ? d.valorNuevo : d.valorAnterior)
                    const isPending = d.aprobado === null
                    const isRechazado = d.aprobado === false
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
                        {tab === 'nuevo' && (() => {
                          // Indicador informativo "genera concurso / sin concurso"
                          // (read-only). El diagnóstico solo carga en snapshots
                          // pendientes; si está aprobado no hay dato de concurso.
                          const concursoCodigo = concursoInfoMap.get(d.idSialRol)
                          const tieneConcurso = concursoInfoMap.has(d.idSialRol)
                          return (
                            <td className="px-4 py-3">
                              {!diagnostico.data ? (
                                <span className="text-gray-300">—</span>
                              ) : tieneConcurso ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                                  Genera concurso{concursoCodigo ? `: ${concursoCodigo}` : ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                                  Sin concurso
                                </span>
                              )}
                            </td>
                          )
                        })()}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}

          {/* Tabla: Modificados / Completados (mismo render antes→después).
              Modificados filtra por un único campo (sub-tab), así que el label
              va en el encabezado. Completados mezcla varios campos → la columna
              "Campo" muestra el label por fila (despojando el prefijo). */}
          {diffs && diffs.data.length > 0 && ((tab === 'modificado' && campoFiltro) || tab === 'completado') && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold">ID SIAL / Rol</th>
                  {tab === 'completado' && <th className="px-4 py-3 font-semibold">Campo</th>}
                  <th className="px-4 py-3 font-semibold">
                    {tab === 'modificado' && campoFiltro ? `${labelCampo(campoFiltro)} — antes` : 'Antes'}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {tab === 'modificado' && campoFiltro ? `${labelCampo(campoFiltro)} — después` : 'Después'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {diffs.data.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{d.apellidoNombre ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{d.idSialRol}</td>
                    {tab === 'completado' && (
                      <td className="px-4 py-3 text-gray-600">{d.campo ? labelCampo(d.campo) : <span className="text-gray-300">—</span>}</td>
                    )}
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
    </>
  )
}
