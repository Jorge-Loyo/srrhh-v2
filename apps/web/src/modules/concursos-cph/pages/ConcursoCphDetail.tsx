import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { PatchConcursoCphRequest } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { usePersonas } from '../../personas/hooks/usePersonas'
import { useConcursoCph, usePatchConcursoCph, useSuspenderConcursoCph } from '../hooks/useConcursosCph'
import { ESTADO_LABEL, ESTADO_BADGE, diasSinMovimiento, diasBadgeClass } from '../lib/labels'
import { SubEstadoTimeline } from '../components/SubEstadoTimeline'

// Escritura: admin/editor/concursales_cph — igual que el permiso concursos-cph.editar
// por defecto en apps/api/.../concursos-cph.routes.ts (editable por el admin desde
// /configuracion/permisos; esto es solo gating visual). El resto ve el formulario disabled.
const WRITE_ROL_SLUGS = ['admin', 'editor', 'concursales_cph']

const fecha = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido'), z.literal('')])
const texto = z.string()

// Mismos 27 campos que PatchConcursoCphRequest (packages/types) — acá todo
// string/boolean sin `| null` porque el form maneja "vacío" como '' y recién
// se convierte a null al armar el body (ver toPatchBody). estado/subEstado no
// forman parte de este form a propósito: los calcula el backend (S4-4).
const formSchema = z.object({
  especialidadSolicitada: texto,
  eeBaja: texto,
  fechaBaja: fecha,
  eeConcurso: texto,
  fechaEeConcurso: fecha,
  fechaAutorizacion: fecha,
  sorteoJurado: fecha,
  disposicion: texto,
  fechaInscDesde: fecha,
  fechaInscHasta: fecha,
  fechaExamen: fecha,
  fechaOrdenMerito: fecha,
  fechaIfacs: fecha,
  fechaInsal: fecha,
  eeDesignacion: texto,
  cargaDocumentacion: z.boolean(),
  fechaAptoMedico: fecha,
  fechaIte: fecha,
  proyectoResolucion: z.boolean(),
  resoALaFirma: z.boolean(),
  resolucionDesignacion: texto,
  fechaResolucion: fecha,
  cargoSial: texto,
  personaDesignadaId: texto,
  dispoDesierta: texto,
  fechaDispoDesierta: fecha,
  observaciones: texto,
})

type FormValues = z.infer<typeof formSchema>

// '' -> null (campo "vacío" = borrar el valor existente), cualquier otra cosa
// viaja tal cual. patchConcursoCphSchema en la API acepta null en los 27.
function toPatchBody(values: FormValues): PatchConcursoCphRequest {
  const body = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(values)) {
    body[key] = typeof value === 'string' ? (value === '' ? null : value) : value
  }
  return body as PatchConcursoCphRequest
}

export function ConcursoCphDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const puedeEditar = !!user && WRITE_ROL_SLUGS.includes(user.rolSlug)

  const { data: concursoCph, isLoading, isError } = useConcursoCph(id)
  const patchMutation = usePatchConcursoCph(id ?? '')
  const suspenderMutation = useSuspenderConcursoCph(id ?? '')
  const [formError, setFormError] = useState('')
  const [saveOk, setSaveOk] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  })

  // Rehidratar el form cada vez que llega/cambia el registro real (carga
  // inicial, o después de guardar/suspender — la mutation actualiza la query
  // cache, este efecto sincroniza el form con ese nuevo valor de verdad).
  useEffect(() => {
    if (!concursoCph) return
    reset({
      especialidadSolicitada: concursoCph.especialidadSolicitada ?? '',
      eeBaja: concursoCph.eeBaja ?? '',
      fechaBaja: concursoCph.fechaBaja?.slice(0, 10) ?? '',
      eeConcurso: concursoCph.eeConcurso ?? '',
      fechaEeConcurso: concursoCph.fechaEeConcurso?.slice(0, 10) ?? '',
      fechaAutorizacion: concursoCph.fechaAutorizacion?.slice(0, 10) ?? '',
      sorteoJurado: concursoCph.sorteoJurado?.slice(0, 10) ?? '',
      disposicion: concursoCph.disposicion ?? '',
      fechaInscDesde: concursoCph.fechaInscDesde?.slice(0, 10) ?? '',
      fechaInscHasta: concursoCph.fechaInscHasta?.slice(0, 10) ?? '',
      fechaExamen: concursoCph.fechaExamen?.slice(0, 10) ?? '',
      fechaOrdenMerito: concursoCph.fechaOrdenMerito?.slice(0, 10) ?? '',
      fechaIfacs: concursoCph.fechaIfacs?.slice(0, 10) ?? '',
      fechaInsal: concursoCph.fechaInsal?.slice(0, 10) ?? '',
      eeDesignacion: concursoCph.eeDesignacion ?? '',
      cargaDocumentacion: concursoCph.cargaDocumentacion ?? false,
      fechaAptoMedico: concursoCph.fechaAptoMedico?.slice(0, 10) ?? '',
      fechaIte: concursoCph.fechaIte?.slice(0, 10) ?? '',
      proyectoResolucion: concursoCph.proyectoResolucion ?? false,
      resoALaFirma: concursoCph.resoALaFirma ?? false,
      resolucionDesignacion: concursoCph.resolucionDesignacion ?? '',
      fechaResolucion: concursoCph.fechaResolucion?.slice(0, 10) ?? '',
      cargoSial: concursoCph.cargoSial ?? '',
      personaDesignadaId: concursoCph.personaDesignadaId ?? '',
      dispoDesierta: concursoCph.dispoDesierta ?? '',
      fechaDispoDesierta: concursoCph.fechaDispoDesierta?.slice(0, 10) ?? '',
      observaciones: concursoCph.observaciones ?? '',
    })
  }, [concursoCph, reset])

  if (isLoading) return <p className="text-sm text-gray-400">Cargando concurso...</p>
  if (isError || !concursoCph) return <p className="text-sm text-danger">No se pudo cargar el concurso CPH.</p>

  const cargo = concursoCph.concurso?.cargo
  const persona = concursoCph.concurso?.persona
  const dias = diasSinMovimiento(concursoCph.updatedAt)

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

  async function toggleSuspendido() {
    setFormError('')
    setSaveOk(false)
    try {
      await suspenderMutation.mutateAsync({ suspendido: !concursoCph?.suspendido })
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/concursos/cph" className="text-sm text-secondary hover:underline">
          ← Volver a Concursos CPH
        </Link>
        <Link to={`/concursos/cph/${id}/wizard`} className="btn-primary text-sm">
          Ver flujo por etapas →
        </Link>
      </div>

      {/* Header — datos que no se editan acá (vienen de Cargo/Concurso) */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">
              {cargo?.codigo ?? cargo?.literalPuesto ?? 'Concurso CPH'}
            </h1>
            <p className="text-sm text-gray-500">
              {concursoCph.hospital?.sigla ?? '—'} · {persona?.apellidoNombre ?? 'Vacante'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={ESTADO_BADGE[concursoCph.estado]}>{ESTADO_LABEL[concursoCph.estado]}</span>
            <span className="badge-info">{concursoCph.subEstado ?? '—'}</span>
            <span className={diasBadgeClass(dias)}>
              {dias === 0 ? 'Movido hoy' : `${dias} días sin movimiento`}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <SubEstadoTimeline subEstado3={concursoCph.subEstado3} suspendido={concursoCph.suspendido} />
        </div>

        {puedeEditar && (
          <button
            type="button"
            onClick={toggleSuspendido}
            disabled={suspenderMutation.isPending}
            className={concursoCph.suspendido ? 'btn-secondary' : 'btn-danger'}
          >
            {suspenderMutation.isPending
              ? 'Guardando...'
              : concursoCph.suspendido
                ? 'Reanudar concurso'
                : 'Suspender concurso'}
          </button>
        )}
      </div>

      {!puedeEditar && (
        <p className="text-sm text-gray-400 bg-white rounded-lg shadow-sm p-4">
          Tu rol no tiene permiso de edición sobre concursos CPH — vista de solo lectura.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={!puedeEditar} className="space-y-6">
          <Fase titulo="Baja / apertura del concurso">
            <Campo label="Especialidad solicitada">
              <input {...register('especialidadSolicitada')} className="input h-10 w-full" />
            </Campo>
            <Campo label="EE de baja">
              <input {...register('eeBaja')} className="input h-10 w-full" placeholder="Nº de expediente" />
            </Campo>
            <Campo label="Fecha de baja">
              <input type="date" {...register('fechaBaja')} className="input h-10 w-full" />
            </Campo>
            <Campo label="EE de concurso">
              <input {...register('eeConcurso')} className="input h-10 w-full" placeholder="Nº de expediente" />
            </Campo>
            <Campo label="Fecha EE de concurso">
              <input type="date" {...register('fechaEeConcurso')} className="input h-10 w-full" />
            </Campo>
          </Fase>

          <Fase titulo="Autorización">
            <Campo label="Fecha de autorización">
              <input type="date" {...register('fechaAutorizacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Sorteo de jurado">
              <input type="date" {...register('sorteoJurado')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Disposición de llamado">
              <input {...register('disposicion')} className="input h-10 w-full" />
            </Campo>
          </Fase>

          <Fase titulo="Inscripción / examen / orden de mérito">
            <Campo label="Inscripción desde">
              <input type="date" {...register('fechaInscDesde')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Inscripción hasta">
              <input type="date" {...register('fechaInscHasta')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha de examen">
              <input type="date" {...register('fechaExamen')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Orden de mérito">
              <input type="date" {...register('fechaOrdenMerito')} className="input h-10 w-full" />
            </Campo>
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
            <Campo label="EE de designación (TAD)">
              <input {...register('eeDesignacion')} className="input h-10 w-full" placeholder="Nº de expediente" />
            </Campo>
            <Campo label="Carga de documentación">
              <input type="checkbox" {...register('cargaDocumentacion')} className="checkbox" />
            </Campo>
            <Campo label="Fecha apto médico">
              <input type="date" {...register('fechaAptoMedico')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha ITE">
              <input type="date" {...register('fechaIte')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Proyecto de resolución">
              <input type="checkbox" {...register('proyectoResolucion')} className="checkbox" />
            </Campo>
            <Campo label="Reso a la firma">
              <input type="checkbox" {...register('resoALaFirma')} className="checkbox" />
            </Campo>
            <Campo label="Resolución de designación">
              <input {...register('resolucionDesignacion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha de resolución">
              <input type="date" {...register('fechaResolucion')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Cargo SIAL (alta)">
              <input {...register('cargoSial')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Persona designada" ancho="col-span-2">
              <PersonaDesignadaPicker
                value={watch('personaDesignadaId')}
                nombreActual={concursoCph.personaDesignada?.apellidoNombre ?? null}
                onChange={(v) => setValue('personaDesignadaId', v, { shouldDirty: true })}
                disabled={!puedeEditar}
              />
            </Campo>
          </Fase>

          <Fase titulo="Desierto">
            <Campo label="Disposición de desierto">
              <input {...register('dispoDesierta')} className="input h-10 w-full" />
            </Campo>
            <Campo label="Fecha de disposición de desierto">
              <input type="date" {...register('fechaDispoDesierta')} className="input h-10 w-full" />
            </Campo>
          </Fase>

          <Fase titulo="Observaciones">
            <Campo label="Observaciones" ancho="col-span-2 sm:col-span-3">
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

        {puedeEditar && (
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

// Combobox con búsqueda async contra GET /api/v1/personas (S3-1) — a
// diferencia de SearchableSelect (shared/components/ui), acá las opciones no
// son una lista fija en memoria: son 45k+ personas, así que se busca por
// texto (debounce 300ms) en vez de filtrar client-side.
function PersonaDesignadaPicker({
  value,
  nombreActual,
  onChange,
  disabled,
}: {
  value: string
  nombreActual: string | null
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebounce(query, 300)
  const { data } = usePersonas({ search: debounced, limit: 8, page: 1 })
  const resultados = debounced ? (data?.data ?? []) : []

  return (
    <div className="relative">
      {value && !open && (
        <div className="flex items-center gap-2">
          <span className="input h-10 flex-1 flex items-center bg-gray-50 text-gray-700">
            {nombreActual ?? value}
          </span>
          {!disabled && (
            <button type="button" className="btn-outline" onClick={() => setOpen(true)}>
              Cambiar
            </button>
          )}
        </div>
      )}
      {(!value || open) && (
        <input
          type="text"
          disabled={disabled}
          placeholder="Buscar persona por nombre, CUIL o DNI..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input h-10 w-full"
        />
      )}
      {open && debounced && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg">
          {resultados.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>}
          {resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
              onClick={() => {
                onChange(p.id)
                setQuery('')
                setOpen(false)
              }}
            >
              {p.apellidoNombre} <span className="text-gray-400">· CUIL {p.cuil}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
