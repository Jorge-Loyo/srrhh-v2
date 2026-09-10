import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import type { PatchConcursoCeetpsRequest } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { useConcursoCeetps, usePatchConcursoCeetps, useDesignarConcursoCeetps } from '../hooks/useConcursosCeetps'
import { ESTADO_LABEL, ESTADO_BADGE, diasSinMovimiento, diasBadgeClass } from '../lib/labels'
import { ExportDropdown } from '@/shared/components/ExportDropdown'
import { getCasoCeetps, exportCeetpsPdf, exportCeetpsWord } from '@/shared/lib/exportConcursoDocs'
import { apiClient } from '@/shared/lib/api-client'

const fecha = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido'), z.literal('')])
const texto = z.string()

// `personaDesignadaId` se saca del form — ahora se registra vía
// POST /:id/designar (S16-4), no via PATCH.
const formSchema = z.object({
  expedienteConcurso: texto,
  puestoSolicitado: texto,
  dispoLlamado: texto,
  cargaHoraria: z.string().regex(/^\d{0,2}$/, 'Máximo 2 dígitos'),
  apertura2x18: z.boolean(),
  informeApertura: texto,
  expedienteConcurso2: texto,
  fechaIfacs: fecha,
  fechaInsal: fecha,
  expedienteDesignacion: texto,
  dispoDesignacion: texto,
  resolucionDesignacion: texto,
  observaciones: texto,
})

type FormValues = z.infer<typeof formSchema>

function toPatchBody(values: FormValues): PatchConcursoCeetpsRequest {
  const body = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(values)) {
    if (key === 'apertura2x18') { body[key] = value; continue }
    if (key === 'cargaHoraria') { body[key] = value === '' ? null : Number(value); continue }
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

  const { register, handleSubmit, reset, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  })

  useEffect(() => {
    if (!concurso) return
    reset({
      expedienteConcurso: concurso.expedienteConcurso ?? '',
      puestoSolicitado: concurso.puestoSolicitado ?? '',
      dispoLlamado: concurso.dispoLlamado ?? '',
      cargaHoraria: concurso.cargaHoraria != null ? String(concurso.cargaHoraria) : '',
      apertura2x18: concurso.apertura2x18 ?? false,
      informeApertura: concurso.informeApertura ?? '',
      expedienteConcurso2: concurso.expedienteConcurso2 ?? '',
      fechaIfacs: concurso.fechaIfacs?.slice(0, 10) ?? '',
      fechaInsal: concurso.fechaInsal?.slice(0, 10) ?? '',
      expedienteDesignacion: concurso.expedienteDesignacion ?? '',
      dispoDesignacion: concurso.dispoDesignacion ?? '',
      resolucionDesignacion: concurso.resolucionDesignacion ?? '',
      observaciones: concurso.observaciones ?? '',
    })
  }, [concurso, reset])

  if (isLoading) return <p className="text-sm text-gray-400">Cargando concurso...</p>
  if (isError || !concurso) return <p className="text-sm text-danger">No se pudo cargar el concurso CEETPS.</p>

  const persona = concurso.concurso?.persona
  const dias = diasSinMovimiento(concurso.updatedAt)

  // PS16D: desierto ya no es estado terminal — solo finalizado bloquea el form
  const estadoTerminal = concurso.estado === 'finalizado'
  const puedeDesignar = puedeEditar && !estadoTerminal && !concurso.personaDesignadaId

  const codigoRegistro = concurso.concurso?.cargo?.codigoRegistro?.codigo ?? ''
  const esEnfermeria = codigoRegistro === '87'
  const conCarga = codigoRegistro === '87' || codigoRegistro === '85'
  const aperturaChecked = watch('apertura2x18')

  async function onSubmit(values: FormValues) {
    setFormError('')
    setSaveOk(false)
    try {
      await patchMutation.mutateAsync(toPatchBody(values))
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
            <span className={ESTADO_BADGE[concurso.estado]}>{ESTADO_LABEL[concurso.estado]}</span>
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
            <Campo label="Puesto solicitado">
              <input {...register('puestoSolicitado')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Disposición de llamado" ancho="sm:col-span-2 md:col-span-1">
              <input {...register('dispoLlamado')} className="input h-10 w-full" />
            </Campo>
            {conCarga && (
              <Campo label="Carga Horaria (hs)">
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
                    <Campo label="2do Expediente Concurso">
                      <input {...register('expedienteConcurso2')} className="input h-10 w-full" />
                    </Campo>
                  </>
                )}
              </>
            )}
          </Fase>

          <Fase titulo="IFACS / INSAL">
            <Campo label="Fecha IFACS">
              <input type="date" {...register('fechaIfacs')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha INSAL">
              <input type="date" {...register('fechaInsal')} className="input h-10 w-full" />
            </Campo>
          </Fase>

          <Fase titulo="Designación">
            <Campo label="Expediente de designación">
              <input {...register('expedienteDesignacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Disposición de designación">
              <input {...register('dispoDesignacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Resolución de designación">
              <input {...register('resolucionDesignacion')} className="input h-10 w-full" />
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

function Fase({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-100">
        <h2 className="font-primary text-base font-bold text-gray-900">{titulo}</h2>
      </div>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">{children}</div>
    </div>
  )
}

function Campo({ label, children, ancho }: { label: string; children: ReactNode; ancho?: string }) {
  return (
    <div className={ancho}>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
