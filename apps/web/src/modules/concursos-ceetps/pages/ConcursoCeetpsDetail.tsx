import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { RolUsuario } from '@srrhh/types'
import type { PatchConcursoCeetpsRequest } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { usePersonas } from '../../personas/hooks/usePersonas'
import { useConcursoCeetps, usePatchConcursoCeetps } from '../hooks/useConcursosCeetps'
import { ESTADO_LABEL, ESTADO_BADGE, diasSinMovimiento, diasBadgeClass } from '../lib/labels'

// Igual que WRITE_ROLES en apps/api/.../concursos-ceetps.routes.ts.
const WRITE_ROLES = [RolUsuario.ADMIN, RolUsuario.EDITOR, RolUsuario.CONCURSALES_CEETPS]

const fecha = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido'), z.literal('')])
const texto = z.string()

// Mismos 10 campos que PatchConcursoCeetpsRequest — `estado` queda afuera,
// lo calcula el backend (calcEstadoCeetps). El plan habla de "fases
// ENF/TEC/EG" pero eso es el escalafón (ya fijo por Concurso.escalafonId,
// no editable acá) — el contrato del PATCH es el mismo set de campos para
// las 3 carreras, no hay 3 formularios distintos.
const formSchema = z.object({
  expedienteConcurso: texto,
  puestoSolicitado: texto,
  dispoLlamado: texto,
  fechaIfacs: fecha,
  fechaInsal: fecha,
  expedienteDesignacion: texto,
  dispoDesignacion: texto,
  resolucionDesignacion: texto,
  personaDesignadaId: texto,
  observaciones: texto,
})

type FormValues = z.infer<typeof formSchema>

function toPatchBody(values: FormValues): PatchConcursoCeetpsRequest {
  const body = {} as Record<string, unknown>
  for (const [key, value] of Object.entries(values)) {
    body[key] = value === '' ? null : value
  }
  return body as PatchConcursoCeetpsRequest
}

export function ConcursoCeetpsDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const puedeEditar = !!user && WRITE_ROLES.includes(user.rol)

  const { data: concurso, isLoading, isError } = useConcursoCeetps(id)
  const patchMutation = usePatchConcursoCeetps(id ?? '')
  const [formError, setFormError] = useState('')
  const [saveOk, setSaveOk] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  })

  useEffect(() => {
    if (!concurso) return
    reset({
      expedienteConcurso: concurso.expedienteConcurso ?? '',
      puestoSolicitado: concurso.puestoSolicitado ?? '',
      dispoLlamado: concurso.dispoLlamado ?? '',
      fechaIfacs: concurso.fechaIfacs?.slice(0, 10) ?? '',
      fechaInsal: concurso.fechaInsal?.slice(0, 10) ?? '',
      expedienteDesignacion: concurso.expedienteDesignacion ?? '',
      dispoDesignacion: concurso.dispoDesignacion ?? '',
      resolucionDesignacion: concurso.resolucionDesignacion ?? '',
      personaDesignadaId: concurso.personaDesignadaId ?? '',
      observaciones: concurso.observaciones ?? '',
    })
  }, [concurso, reset])

  if (isLoading) return <p className="text-sm text-gray-400">Cargando concurso...</p>
  if (isError || !concurso) return <p className="text-sm text-danger">No se pudo cargar el concurso CEETPS.</p>

  const persona = concurso.concurso?.persona
  const dias = diasSinMovimiento(concurso.updatedAt)
  const estadoTerminal = concurso.estado === 'finalizado' || concurso.estado === 'desierto'

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

  return (
    <div className="space-y-6">
      <Link to="/concursos/ceetps" className="text-sm text-secondary hover:underline">
        ← Volver a Concursos CEETPS
      </Link>

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
          <div className="flex items-center gap-2">
            <span className={ESTADO_BADGE[concurso.estado]}>{ESTADO_LABEL[concurso.estado]}</span>
            <span className={diasBadgeClass(dias)}>{dias === 0 ? 'Movido hoy' : `${dias} días sin movimiento`}</span>
          </div>
        </div>

        {estadoTerminal && (
          <p className="text-xs text-gray-400 mt-2">
            Concurso {ESTADO_LABEL[concurso.estado].toLowerCase()} — no se puede modificar (bloqueado por la API).
          </p>
        )}
      </div>

      {!puedeEditar && (
        <p className="text-sm text-gray-400 bg-white rounded-lg shadow-sm p-4">
          Tu rol no tiene permiso de edición sobre concursos CEETPS — vista de solo lectura.
        </p>
      )}

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
            <Campo label="Persona designada" ancho="sm:col-span-2 md:col-span-3">
              <PersonaDesignadaPicker
                value={watch('personaDesignadaId')}
                nombreActual={concurso.personaDesignada?.apellidoNombre ?? null}
                onChange={(v) => setValue('personaDesignadaId', v, { shouldDirty: true })}
                disabled={!puedeEditar || estadoTerminal}
              />
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

// Mismo picker que ConcursoCphDetail (búsqueda async contra GET
// /api/v1/personas, 45k+ registros no entran en un <select>) — duplicado acá
// en vez de importado desde concursos-cph a propósito: son módulos hermanos
// sin dependencia real entre sí (mismo criterio que labels.ts).
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
