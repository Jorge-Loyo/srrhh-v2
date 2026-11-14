import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PatchConcursoCeetpsRequest } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { usePuestosCargoNormalizados } from '@/shared/hooks/useCatalogos'
import { useConcursoCeetps, usePatchConcursoCeetps, useDesignarConcursoCeetps } from '../hooks/useConcursosCeetps'
import { ESTADO_LABEL, ESTADO_BADGE, SUB_ESTADO_LABEL, SUB_ESTADO_BADGE, diasSinMovimiento, diasBadgeClass } from '../lib/labels'
import { motivoConcursoLabel } from '@/modules/cargos/lib/bajasHelpers'
import { ExportDropdown } from '@/shared/components/ExportDropdown'
import { getCasoCeetps, exportCeetpsPdf, exportCeetpsWord } from '@/shared/lib/exportConcursoDocs'
import { apiClient } from '@/shared/lib/api-client'
import { CorregirTipoControl } from '@/modules/concursos-cph/components/CorregirTipoControl'
import { etapa1CompletaParaAutorizar, puedeCorregirTipo } from '@/modules/concursos-cph/lib/corregirTipo'
import {
  avisoAutorizacionNuevoCargo,
  esNuevoCargoSinAutorizar,
  omitirCamposCeetpsBloqueados,
} from '@/modules/concursos-cph/lib/bloqueoAutorizacion'

const fecha = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido'), z.literal('')])
const texto = z.string()

// `personaDesignadaId` se saca del form — ahora se registra vía
// POST /:id/designar (S16-4), no via PATCH.
const formSchema = z.object({
  // ── Proceso previo ─────────────────────────────────────────────────────────
  expedienteConcurso: texto,
  // Paso 2b: IF de autorización de apertura (opcional: puede completarse después, aun autorizado)
  ifAutorizacion: texto,
  fechaCaratulacion: fecha,
  fechaAutorizacion: fecha,
  tipificadorOrigen: texto,
  // ── Puesto solicitado ──────────────────────────────────────────────────────
  // S20-10: id del catálogo — reemplaza el input libre de puestoSolicitado.
  puestoCargoSolicitadoId: texto,
  dispoLlamado: texto,
  // ── Carga horaria / apertura (Enfermería/Técnicos) ─────────────────────────
  cargaHoraria: z.string().regex(/^\d{0,2}$/, 'Máximo 2 dígitos'),
  apertura2x18: z.boolean(),
  informeApertura: texto,
  expedienteConcurso2: texto,
  // ── Cambio de especialidad ─────────────────────────────────────────────────
  cambioEspecialidad: z.boolean(),
  docCambioEspecialidad: texto,
  // ── IFACS / INSAL ──────────────────────────────────────────────────────────
  fechaIfacs: fecha,
  fechaInsal: fecha,
  // ── Designación ───────────────────────────────────────────────────────────
  expedienteDesignacion: texto,
  dispoDesignacion: texto,
  resolucionDesignacion: texto,
  puestoDesignado: texto,
  estadoApto: texto,
  numeroAptoMedico: texto,
  fechaProyectoDispo: fecha,
  altaSial: z.boolean(),
  codigoSial: texto,
  // ── Observaciones ─────────────────────────────────────────────────────────
  observaciones: texto,
})

type FormValues = z.infer<typeof formSchema>

function toPatchBody(values: FormValues, dirtyFields: Partial<Record<keyof FormValues, boolean>>): PatchConcursoCeetpsRequest {
  const body = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(values)) {
    // puestoCargoSolicitadoId: solo incluir en el body si el usuario lo
    // cambió explícitamente (shouldDirty). Si no se tocó, omitir para no
    // disparar la lógica S20-10 del backend en cada guardado.
    if (key === 'puestoCargoSolicitadoId') {
      if (dirtyFields.puestoCargoSolicitadoId) {
        body[key] = value === '' ? null : value
      }
      continue
    }
    // Booleanos: siempre se mandan tal cual
    if (key === 'apertura2x18' || key === 'cambioEspecialidad' || key === 'altaSial') {
      body[key] = value
      continue
    }
    if (key === 'cargaHoraria') {
      body[key] = value === '' ? null : Number(value)
      continue
    }
    body[key] = value === '' ? null : value
  }
  return body as PatchConcursoCeetpsRequest
}

export function ConcursoCeetpsDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const puedeEditar = can(user, 'concursos-ceetps', 'editar')

  const { data: concurso, isLoading, isError } = useConcursoCeetps(id)
  const patchMutation = usePatchConcursoCeetps(id ?? '')
  const designarMutation = useDesignarConcursoCeetps(id ?? '')
  const queryClient = useQueryClient()
  // Paso 5a: aviso de éxito que deja la corrección de tipo al navegar a este concurso.
  const location = useLocation()
  const [avisoTipo, setAvisoTipo] = useState<string | null>(
    (location.state as { avisoTipo?: string } | null)?.avisoTipo ?? null,
  )

  // Paso 2b: resolver la autorización pendiente (SGRASV) desde el propio concurso.
  const [obsResolver, setObsResolver] = useState('')
  const [errorResolver, setErrorResolver] = useState('')
  const resolverMutation = useMutation({
    mutationFn: ({ autorizacionId, accion, observaciones }: { autorizacionId: string; accion: 'aprobar' | 'rechazar'; observaciones?: string }) =>
      apiClient.post(`/api/v1/autorizaciones/${autorizacionId}/${accion}`, { observaciones }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concursos-ceetps'] })
      queryClient.invalidateQueries({ queryKey: ['autorizaciones'] })
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
      setObsResolver('')
      setErrorResolver('')
    },
    onError: (err) => setErrorResolver(getApiErrorMessage(err)),
  })

  const [formError, setFormError] = useState('')
  const [saveOk, setSaveOk] = useState(false)

  // Estado modal designación
  const [modalDesignar, setModalDesignar] = useState(false)
  const [designarSearch, setDesignarSearch] = useState('')
  const [designarPersonaId, setDesignarPersonaId] = useState('')
  const [designarFechaDesde, setDesignarFechaDesde] = useState('')
  const [designarIdSialRol, setDesignarIdSialRol] = useState('')

  // Búsqueda de personas para el selector de designación
  const { data: personasDesignarData } = useQuery({
    queryKey: ['personas-designar-ceetps', designarSearch],
    queryFn: async () => {
      if (designarSearch.length < 2) return []
      const res = await apiClient.get<{ data: { id: string; apellidoNombre: string; cuil: string }[] }>(
        '/api/v1/personas',
        { params: { search: designarSearch, limit: 20 } }
      )
      return res.data.data
    },
    enabled: designarSearch.length >= 2,
  })

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  })

  // Limpia el mensaje de éxito cuando el usuario retoca el form
  useEffect(() => {
    if (formState.isDirty) setSaveOk(false)
  }, [formState.isDirty])

  // S20-10: catálogo de puestos del escalafón del concurso, para el combobox.
  const { data: puestosCatalogo = [] } = usePuestosCargoNormalizados(concurso?.escalafonId)
  const puestoCargoSolicitadoId = watch('puestoCargoSolicitadoId')
  const aperturaChecked = watch('apertura2x18')
  const cambioEspecialidadChecked = watch('cambioEspecialidad')

  useEffect(() => {
    if (!concurso) return
    reset({
      expedienteConcurso:     concurso.expedienteConcurso ?? '',
      ifAutorizacion:         concurso.ifAutorizacion ?? '',
      fechaCaratulacion:      concurso.fechaCaratulacion?.slice(0, 10) ?? '',
      fechaAutorizacion:      concurso.fechaAutorizacion?.slice(0, 10) ?? '',
      tipificadorOrigen:      concurso.tipificadorOrigen ?? '',
      puestoCargoSolicitadoId: concurso.puestoCargoSolicitadoId ?? '',
      dispoLlamado:           concurso.dispoLlamado ?? '',
      cargaHoraria:           concurso.cargaHoraria != null ? String(concurso.cargaHoraria) : '',
      apertura2x18:           concurso.apertura2x18 ?? false,
      informeApertura:        concurso.informeApertura ?? '',
      expedienteConcurso2:    concurso.expedienteConcurso2 ?? '',
      cambioEspecialidad:     concurso.cambioEspecialidad ?? false,
      docCambioEspecialidad:  concurso.docCambioEspecialidad ?? '',
      fechaIfacs:             concurso.fechaIfacs?.slice(0, 10) ?? '',
      fechaInsal:             concurso.fechaInsal?.slice(0, 10) ?? '',
      expedienteDesignacion:  concurso.expedienteDesignacion ?? '',
      dispoDesignacion:       concurso.dispoDesignacion ?? '',
      resolucionDesignacion:  concurso.resolucionDesignacion ?? '',
      puestoDesignado:        concurso.puestoDesignado ?? '',
      estadoApto:             concurso.estadoApto ?? '',
      numeroAptoMedico:       concurso.numeroAptoMedico ?? '',
      fechaProyectoDispo:     concurso.fechaProyectoDispo?.slice(0, 10) ?? '',
      altaSial:               concurso.altaSial ?? false,
      codigoSial:             concurso.codigoSial ?? '',
      observaciones:          concurso.observaciones ?? '',
    })
  }, [concurso, reset])

  if (isLoading) return <p className="text-sm text-gray-400">Cargando concurso...</p>
  if (isError || !concurso) return <p className="text-sm text-danger">No se pudo cargar el concurso CEETPS.</p>

  const persona = concurso.concurso?.persona
  const dias = diasSinMovimiento(concurso.updatedAt)

  // PS16D: desierto ya no es estado terminal — solo finalizado bloquea el form
  const estadoTerminal = concurso.estado === 'finalizado'
  // Paso 2b: nuevo_cargo sin autorizar → Etapa 2+ y designación bloqueadas hasta que SGRASV autorice.
  const sinAutorizar = esNuevoCargoSinAutorizar(concurso.concurso)
  const avisoAutorizacion = avisoAutorizacionNuevoCargo(concurso.concurso)
  const puedeDesignar = puedeEditar && !estadoTerminal && !concurso.personaDesignadaId && !sinAutorizar
  const autorizacionPendiente = sinAutorizar ? concurso.autorizacionPendiente ?? null : null
  const rechazoAviso = sinAutorizar && !autorizacionPendiente ? concurso.ultimaAutorizacionRechazada ?? null : null
  const puedeResolver =
    !!autorizacionPendiente && (autorizacionPendiente.resolverPorRolSlug === user?.rolSlug || user?.rolSlug === 'admin')

  const codigoRegistro = concurso.concurso?.cargo?.codigoRegistro?.codigo ?? ''
  const esEnfermeria = codigoRegistro === '87'
  const conCarga = codigoRegistro === '87' || codigoRegistro === '85'

  async function onSubmit(values: FormValues) {
    setFormError('')
    setSaveOk(false)
    try {
      const body = toPatchBody(values, formState.dirtyFields as Partial<Record<keyof FormValues, boolean>>)
      // El IF solo aplica a nuevo_cargo; los campos de Etapa 2+ no se envían sin autorización.
      if (concurso?.concurso?.motivoConcurso !== 'nuevo_cargo') delete body.ifAutorizacion
      await patchMutation.mutateAsync(omitirCamposCeetpsBloqueados(body as Record<string, unknown>, concurso?.concurso) as PatchConcursoCeetpsRequest)
      setSaveOk(true)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  function cerrarModalDesignar() {
    setModalDesignar(false)
    setDesignarPersonaId('')
    setDesignarSearch('')
    setDesignarFechaDesde('')
    setDesignarIdSialRol('')
  }

  return (
    <div className="space-y-6">

      {/* ── MODAL DESIGNAR ─────────────────────────────────────────────────── */}
      {modalDesignar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <span className="text-green-500 text-xl">👤</span>
              <div>
                <h3 className="font-primary font-bold text-gray-900">Registrar designación</h3>
                <p className="text-xs text-gray-500 mt-0.5">El cargo quedará ocupado inmediatamente, sin esperar el padrón.</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Persona designada <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={designarSearch}
                  onChange={(e) => { setDesignarSearch(e.target.value); setDesignarPersonaId('') }}
                  className="input h-10 w-full"
                  placeholder="Buscar por nombre o CUIL..."
                />
                {personasDesignarData && personasDesignarData.length > 0 && !designarPersonaId && (
                  <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                    {personasDesignarData.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        onClick={() => { setDesignarPersonaId(p.id); setDesignarSearch(p.apellidoNombre) }}
                      >
                        <span className="font-medium text-gray-800">{p.apellidoNombre}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{p.cuil}</span>
                      </button>
                    ))}
                  </div>
                )}
                {designarPersonaId && (
                  <p className="mt-1 text-xs text-green-600">✓ Persona seleccionada</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Fecha de inicio <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={designarFechaDesde}
                  onChange={(e) => setDesignarFechaDesde(e.target.value)}
                  className="input h-10 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  ID SIAL Rol <span className="text-xs font-normal text-gray-400">(opcional — se completa cuando llegue el padrón)</span>
                </label>
                <input
                  type="text"
                  value={designarIdSialRol}
                  onChange={(e) => setDesignarIdSialRol(e.target.value)}
                  className="input h-10 w-full font-mono"
                  placeholder="Ej: 12345678"
                />
              </div>
              {designarMutation.isError && (
                <p className="text-sm text-danger">
                  {(designarMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar la designación'}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button className="btn-outline" onClick={cerrarModalDesignar}>Cancelar</button>
              <button
                className="btn-primary"
                disabled={!designarPersonaId || !designarFechaDesde || designarMutation.isPending}
                onClick={() => {
                  designarMutation.mutate(
                    { personaId: designarPersonaId, fechaDesde: designarFechaDesde, idSialRol: designarIdSialRol || undefined },
                    { onSuccess: cerrarModalDesignar }
                  )
                }}
              >
                {designarMutation.isPending ? 'Guardando...' : 'Confirmar designación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Link to="/concursos/ceetps" className="text-sm text-secondary hover:underline">
        ← Volver a Concursos CEETPS
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">
              {concurso.puestoSolicitado ?? 'Concurso CEETPS'}
            </h1>
            <p className="text-sm text-gray-500">
              {concurso.hospital?.sigla ?? '—'} · {concurso.escalafon ? escalafonLabel(concurso.escalafon.nombre) : '—'} ·{' '}
              {persona?.apellidoNombre ?? 'Vacante'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge-default" title="Tipo de concurso">Tipo: CEETPS</span>
            {id && puedeCorregirTipo(user, concurso) && (
              <CorregirTipoControl
                tipoActual="ceetps"
                detalleId={id}
                etapa1Completa={etapa1CompletaParaAutorizar(concurso)}
              />
            )}
            <span className={ESTADO_BADGE[concurso.estado]}>{ESTADO_LABEL[concurso.estado]}</span>
            {concurso.subEstado && (
              <span className={SUB_ESTADO_BADGE[concurso.subEstado] ?? 'badge-default'}>
                {SUB_ESTADO_LABEL[concurso.subEstado] ?? concurso.subEstado}
              </span>
            )}
            {motivoConcursoLabel(concurso.concurso?.motivoConcurso) && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                {motivoConcursoLabel(concurso.concurso?.motivoConcurso)}
              </span>
            )}
            <span className={diasBadgeClass(dias)}>{dias === 0 ? 'Movido hoy' : `${dias} días sin movimiento`}</span>
            {getCasoCeetps(concurso).validacion && (
              <ExportDropdown
                label="Validación"
                onExport={(fmt) => (fmt === 'pdf' ? exportCeetpsPdf(concurso, 'validacion') : exportCeetpsWord(concurso, 'validacion'))}
              />
            )}
            {concurso.expedienteConcurso && (
              <ExportDropdown
                label="Autorización"
                onExport={(fmt) => (fmt === 'pdf' ? exportCeetpsPdf(concurso, 'autorizacion') : exportCeetpsWord(concurso, 'autorizacion'))}
              />
            )}
          </div>
        </div>
        {estadoTerminal && (
          <p className="text-xs text-gray-400 mt-2">
            Concurso finalizado — no se puede modificar.
          </p>
        )}
      </div>

      {avisoTipo && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800" role="status">
          <span>✓ {avisoTipo}</span>
          <button type="button" className="text-xs underline" onClick={() => setAvisoTipo(null)}>
            Cerrar
          </button>
        </div>
      )}
      {(concurso.correccionesTipo?.length ?? 0) > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-700">
          <p className="font-semibold mb-1">Historial de cambios de tipo</p>
          <ul className="space-y-0.5">
            {concurso.correccionesTipo!.map((c) => (
              <li key={c.id}>
                {new Date(c.fecha).toLocaleDateString('es-AR')}: de {c.tipoOrigen === 'cph' ? 'CPH' : 'CEETPS'} a{' '}
                {c.tipoDestino === 'cph' ? 'CPH' : 'CEETPS'}
                {c.usuario ? ` por ${c.usuario}` : ''}. Motivo: {c.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rechazoAviso && (
        <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm">
          <span className="text-red-500 text-base mt-0.5">⛔</span>
          <div>
            <p className="font-semibold text-red-800">Autorización rechazada</p>
            <p className="text-red-700 text-xs mt-0.5 whitespace-pre-line">
              Motivo: {rechazoAviso.observaciones || 'sin observación'}
            </p>
            <p className="text-red-600 text-[11px] mt-1">
              {rechazoAviso.resueltaPor ? `Rechazada por ${rechazoAviso.resueltaPor} el ` : 'Rechazada el '}
              {new Date(rechazoAviso.resueltaAt).toLocaleDateString('es-AR')}. Corregí y volvé a guardar para solicitarla de nuevo.
            </p>
          </div>
        </div>
      )}

      {avisoAutorizacion && (
        <div
          className={
            avisoAutorizacion === 'Autorizado'
              ? 'rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm font-semibold text-green-800'
              : 'rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-800'
          }
        >
          {avisoAutorizacion === 'Autorizado' ? '✓ ' : '⏳ '}
          {avisoAutorizacion}
        </div>
      )}

      {puedeResolver && autorizacionPendiente && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-amber-200">
          <div className="px-6 py-3 border-b border-gray-100">
            <h2 className="font-primary text-base font-bold text-gray-900">Resolver autorización</h2>
          </div>
          <div className="p-6 space-y-3">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="obs-resolver-ceetps">
              Observaciones <span className="text-xs font-normal text-gray-400">(obligatoria al rechazar)</span>
            </label>
            <textarea
              id="obs-resolver-ceetps"
              value={obsResolver}
              onChange={(e) => setObsResolver(e.target.value)}
              rows={3}
              className="input w-full py-2"
              placeholder="Motivo de la decisión..."
            />
            {errorResolver && <p className="text-sm text-danger">{errorResolver}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn-danger"
                disabled={resolverMutation.isPending || !obsResolver.trim()}
                onClick={() => resolverMutation.mutate({ autorizacionId: autorizacionPendiente.id, accion: 'rechazar', observaciones: obsResolver.trim() })}
              >
                Rechazar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={resolverMutation.isPending}
                onClick={() => resolverMutation.mutate({ autorizacionId: autorizacionPendiente.id, accion: 'aprobar', observaciones: obsResolver.trim() || undefined })}
              >
                Aprobar
              </button>
            </div>
          </div>
        </div>
      )}

      {!puedeEditar && (
        <p className="text-sm text-gray-400 bg-white rounded-lg shadow-sm p-4">
          Tu rol no tiene permiso de edición sobre concursos CEETPS — vista de solo lectura.
        </p>
      )}

      {/* Panel designación — separado del form (S16-4) */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100">
          <h2 className="font-primary text-base font-bold text-gray-900">Persona designada</h2>
        </div>
        <div className="p-6">
          {concurso.personaDesignada ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1">
              <p className="text-sm font-bold text-gray-900">{concurso.personaDesignada.apellidoNombre}</p>
              <p className="text-xs text-gray-500">CUIL: <span className="font-mono text-gray-700">{concurso.personaDesignada.cuil}</span></p>
            </div>
          ) : puedeDesignar ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-800">Sin persona designada</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  El cargo quedará ocupado inmediatamente sin esperar el padrón siguiente.
                </p>
              </div>
              <button className="btn-primary text-sm shrink-0" onClick={() => setModalDesignar(true)}>
                👤 Designar
              </button>
            </div>
          ) : sinAutorizar && puedeEditar && !estadoTerminal ? (
            <p className="text-sm text-amber-700">Pendiente de autorización de SGRASV</p>
          ) : (
            <p className="text-sm text-gray-400">Sin persona designada.</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={!puedeEditar || estadoTerminal} className="space-y-6">
          <Fase titulo="Convocatoria">
            <Campo label="Expediente de concurso">
              <input {...register('expedienteConcurso')} className="input h-10 w-full" />
            </Campo>
            {concurso.concurso?.motivoConcurso === 'nuevo_cargo' && (
              <Campo label="IF de autorización de apertura">
                <input {...register('ifAutorizacion')} className="input h-10 w-full" placeholder="Ej: IF-2026-00000000-GDEBA-SSRHH" />
                <p className="text-xs text-gray-500 mt-1">El IF puede completarse después, incluso con el concurso ya autorizado.</p>
              </Campo>
            )}
            <Campo label="Fecha de caratulación">
              <input type="date" {...register('fechaCaratulacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha de autorización">
              <input type="date" {...register('fechaAutorizacion')} disabled={sinAutorizar} className="input h-10 w-full" />
            </Campo>
            <Campo label="Tipificador de origen">
              <input {...register('tipificadorOrigen')} className="input h-10 w-full" placeholder="Ej: Bajas 2025, Ampliación 2026…" />
            </Campo>
            <Campo label="Puesto solicitado">
              <select
                value={puestoCargoSolicitadoId}
                onChange={(e) => setValue('puestoCargoSolicitadoId', e.target.value, { shouldDirty: true })}
                className="input h-10 w-full"
              >
                <option value="">— Mismo puesto que la baja —</option>
                {puestosCatalogo.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Disposición de llamado">
              <input {...register('dispoLlamado')} disabled={sinAutorizar} className="input h-10 w-full" />
            </Campo>
            {conCarga && (
              <Campo label="Carga horaria (hs)">
                <input {...register('cargaHoraria')} inputMode="numeric" maxLength={2} className="input h-10 w-full" />
              </Campo>
            )}
            {esEnfermeria && (
              <>
                <Campo label="Apertura 2×18hs">
                  <label className="flex items-center gap-2 h-10">
                    <input type="checkbox" {...register('apertura2x18')} className="h-4 w-4 rounded border-gray-300" />
                    <span className="text-sm text-gray-600">1 cargo de 35hs se abre en 2 de 18hs</span>
                  </label>
                </Campo>
                {aperturaChecked && (
                  <>
                    <Campo label="N° Informe apertura">
                      <input {...register('informeApertura')} className="input h-10 w-full" />
                    </Campo>
                    <Campo label="2do Expediente de concurso">
                      <input {...register('expedienteConcurso2')} className="input h-10 w-full" />
                    </Campo>
                  </>
                )}
              </>
            )}
          </Fase>

          {/* Cambio de especialidad — solo visible si el puesto solicitado
              difiere del de la baja. Se puede marcar manualmente. */}
          <Fase titulo="Cambio de especialidad">
            <Campo label="Solicitud de cambio de especialidad" ancho="sm:col-span-2 md:col-span-3">
              <label className="flex items-center gap-2 h-10">
                <input type="checkbox" {...register('cambioEspecialidad')} className="h-4 w-4 rounded border-gray-300" />
                <span className="text-sm text-gray-600">
                  El puesto/especialidad solicitado difiere del de la baja de origen
                </span>
              </label>
            </Campo>
            {cambioEspecialidadChecked && (
              <Campo label="Documentación del cambio de especialidad" ancho="sm:col-span-2 md:col-span-3">
                <input
                  {...register('docCambioEspecialidad')}
                  className="input h-10 w-full"
                  placeholder="N° de expediente o informe que documenta el cambio"
                />
              </Campo>
            )}
          </Fase>

          <Fase titulo="IFACS / INSAL" bloqueada={sinAutorizar}>
            <Campo label="Fecha IFACS">
              <input type="date" {...register('fechaIfacs')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha INSAL">
              <input type="date" {...register('fechaInsal')} className="input h-10 w-full" />
            </Campo>
          </Fase>

          <Fase titulo="Designación" bloqueada={sinAutorizar}>
            <Campo label="Expediente de designación (TAD)">
              <input {...register('expedienteDesignacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Puesto designado">
              <input {...register('puestoDesignado')} className="input h-10 w-full" placeholder="Si difiere del solicitado…" />
            </Campo>
            <Campo label="Disposición de designación">
              <input {...register('dispoDesignacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Resolución de designación">
              <input {...register('resolucionDesignacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Estado del apto médico">
              <input {...register('estadoApto')} className="input h-10 w-full" placeholder="Ej: Apto, En trámite…" />
            </Campo>
            <Campo label="N° Apto médico">
              <input {...register('numeroAptoMedico')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha proyecto de disposición">
              <input type="date" {...register('fechaProyectoDispo')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Alta en SIAL">
              <label className="flex items-center gap-2 h-10">
                <input type="checkbox" {...register('altaSial')} className="h-4 w-4 rounded border-gray-300" />
                <span className="text-sm text-gray-600">Cargo dado de alta en SIAL</span>
              </label>
            </Campo>
            <Campo label="Código SIAL">
              <input {...register('codigoSial')} className="input h-10 w-full font-mono" placeholder="Ej: 001712179-3" />
            </Campo>
          </Fase>

          <Fase titulo="Observaciones">
            <Campo label="Observaciones" ancho="sm:col-span-2 md:col-span-3">
              <textarea {...register('observaciones')} rows={3} className="input w-full py-2" />
            </Campo>
          </Fase>
        </fieldset>

        {formError && (
          <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">{formError}</div>
        )}
        {saveOk && !formState.isDirty && (
          <div className="bg-green-50 border border-green-300 text-green-800 text-sm px-3 py-2 rounded">
            Cambios guardados.
          </div>
        )}

        {puedeEditar && !estadoTerminal && (
          <button type="submit" disabled={formState.isSubmitting} className="btn-primary">
            {formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
          </button>
        )}
      </form>
    </div>
  )
}

function Fase({ titulo, children, bloqueada = false }: { titulo: string; children: ReactNode; bloqueada?: boolean }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="font-primary text-base font-bold text-gray-900">{titulo}</h2>
        {bloqueada && <span className="text-xs font-semibold text-amber-700">Pendiente de autorización de SGRASV</span>}
      </div>
      <fieldset disabled={bloqueada} className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 min-w-0">{children}</fieldset>
    </div>
  )
}

function Campo({ label, children, ancho = 'col-span-1' }: { label: string; children: ReactNode; ancho?: string }) {
  return (
    <div className={ancho}>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
