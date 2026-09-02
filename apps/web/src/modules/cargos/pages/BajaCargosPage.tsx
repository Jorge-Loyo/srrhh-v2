import { Fragment, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { EstadoBaja, TipoConcurso } from '@srrhh/types'
import type { Cargo, PersonaListItem } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { apiClient } from '@/shared/lib/api-client'
import { usePersonas } from '../../personas/hooks/usePersonas'
import { useBajas, useCreateBaja } from '../hooks/useBajas'


const ESTADO_LABEL: Record<EstadoBaja, string> = {
  [EstadoBaja.PENDIENTE]: 'Pendiente',
  [EstadoBaja.CONFIRMADA]: 'Confirmada',
  [EstadoBaja.ANULADA]: 'Anulada',
}
const ESTADO_BADGE: Record<EstadoBaja, string> = {
  [EstadoBaja.PENDIENTE]: 'badge-warning',
  [EstadoBaja.CONFIRMADA]: 'badge-success',
  [EstadoBaja.ANULADA]: 'badge-danger',
}

// Lista sugerida, no obligatoria — ver análisis de datos reales en
// PLAN_SCRUM_2026.md (POST-SPRINT 4 (4)): 97% de las bajas reales no tienen
// tipo cargado, así que es un <input list> con datalist, no un <select>.
const TIPOS_BAJA_SUGERIDOS = [
  'Cargo retenido',
  'Interino',
  'Jubilación',
  'Cambio de Efector',
  'Renuncia',
  'Pase a Planta',
  'CC POU a POF',
  'CC POF a POU',
  'Jefatura',
  'Fallecimiento',
]
const TIPIFICADORES_SUGERIDOS = [
  'Bajas 2026',
  'Bajas 2025',
  'Bajas 2024',
  'Bajas 2023',
  'Ampliación 2026',
  'Ampliación 2022',
  'Bajada Odoo',
  'Art. 48',
  'Obra',
  'Cobertura Dotación',
]

const LIMIT = 50

// S5-5: si generaConcurso es true, tipoConcurso es requerido — y si
// tipoConcurso es ceetps, escalafonId también. Mismos dos .refine() que
// createBajaSchema en el backend (apps/api/.../bajas.schema.ts), duplicados
// acá para dar el error en el form antes de pegarle a la API — createBajaSchema
// ya los valida igual del otro lado, esto es solo mejor UX.
const formSchema = z
  .object({
    cargoId: z.string().uuid('Elegí un cargo'),
    hospitalId: z.string().uuid(),
    personaId: z.string().optional(),
    fechaBaja: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí una fecha'),
    tipoBaja: z.string().optional(),
    motivo: z.string().optional(),
    tipificadorOrigen: z.string().optional(),
    generaConcurso: z.boolean(),
    tipoConcurso: z.nativeEnum(TipoConcurso).optional(),
    escalafonId: z.string().optional(),
    observaciones: z.string().optional(),
  })
  .refine((d) => !d.generaConcurso || !!d.tipoConcurso, {
    message: 'Elegí el tipo de concurso',
    path: ['tipoConcurso'],
  })
  .refine((d) => d.tipoConcurso !== TipoConcurso.CEETPS || !!d.escalafonId, {
    message: 'Elegí el escalafón',
    path: ['escalafonId'],
  })
type FormValues = z.infer<typeof formSchema>

export function BajaCargosPage() {
  const { user } = useAuth()
  const puedeCrear = can(user, 'bajas', 'crear')

  const [search, setSearch] = useState('')
  const [hospitalId, setHospitalId] = useState('')
  const [estado, setEstado] = useState<'' | EstadoBaja>('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const searchDebounced = useDebounce(search, 300)

  const filters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(estado && { estado }),
  }
  const { data, isLoading, isFetching, isError } = useBajas(filters)
  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()
  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )
  const createBaja = useCreateBaja()

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { generaConcurso: true },
  })
  const cargoSeleccionadoId = watch('cargoId')
  const generaConcurso = watch('generaConcurso')
  const tipoConcursoElegido = watch('tipoConcurso')

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await createBaja.mutateAsync({
        cargoId: values.cargoId,
        hospitalId: values.hospitalId,
        personaId: values.personaId || undefined,
        fechaBaja: values.fechaBaja,
        tipoBaja: values.tipoBaja || undefined,
        motivo: values.motivo || undefined,
        tipificadorOrigen: values.tipificadorOrigen || undefined,
        generaConcurso: values.generaConcurso,
        tipoConcurso: values.generaConcurso ? values.tipoConcurso : undefined,
        escalafonId: values.tipoConcurso === TipoConcurso.CEETPS ? values.escalafonId : undefined,
        observaciones: values.observaciones || undefined,
      })
      reset({ generaConcurso: true })
      setShowForm(false)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Baja de Cargos</h1>
          {puedeCrear && (
            <button className="btn-danger" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancelar' : '+ Nueva Baja'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por código de cargo, persona, motivo, tipificador..."
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
                {h.sigla}
              </option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => resetPage(setEstado)(e.target.value as '' | EstadoBaja)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los estados</option>
            {Object.values(EstadoBaja).map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-lg shadow-sm p-6 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Cargo <span className="text-danger">*</span>
            </label>
            <CargoPicker
              value={cargoSeleccionadoId}
              onChange={(cargo) => {
                setValue('cargoId', cargo.id, { shouldValidate: true })
                setValue('hospitalId', cargo.hospitalId, { shouldValidate: true })
              }}
            />
            {formState.errors.cargoId && (
              <p className="text-xs text-danger mt-1">{formState.errors.cargoId.message}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Persona <span className="text-gray-400 font-normal">(opcional — vacía si es por ampliación)</span>
            </label>
            <PersonaPicker value={watch('personaId') ?? ''} onChange={(id) => setValue('personaId', id)} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Fecha de baja <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              {...register('fechaBaja')}
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            {formState.errors.fechaBaja && (
              <p className="text-xs text-danger mt-1">{formState.errors.fechaBaja.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Tipo de baja <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              {...register('tipoBaja')}
              list="tipos-baja"
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            <datalist id="tipos-baja">
              {TIPOS_BAJA_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Motivo <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              {...register('motivo')}
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Tipificador de origen <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              {...register('tipificadorOrigen')}
              list="tipificadores"
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            <datalist id="tipificadores">
              {TIPIFICADORES_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" {...register('generaConcurso')} className="checkbox" id="generaConcurso" />
              <label htmlFor="generaConcurso" className="text-sm text-gray-700">
                Genera concurso de reemplazo
              </label>
            </div>

            {/* S5-5: si genera concurso, el backend crea el seguimiento
                automático — necesita saber a qué carrera (tipoConcurso), y
                si es CEETPS, a qué escalafón. */}
            {generaConcurso && (
              <div className="flex flex-wrap gap-3 pl-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Tipo de concurso <span className="text-danger">*</span>
                  </label>
                  <select
                    {...register('tipoConcurso')}
                    defaultValue=""
                    className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  >
                    <option value="" disabled>
                      Elegir...
                    </option>
                    <option value={TipoConcurso.CPH}>CPH</option>
                    <option value={TipoConcurso.CEETPS}>CEETPS</option>
                  </select>
                  {formState.errors.tipoConcurso && (
                    <p className="text-xs text-danger mt-1">{formState.errors.tipoConcurso.message}</p>
                  )}
                </div>

                {tipoConcursoElegido === TipoConcurso.CEETPS && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Escalafón <span className="text-danger">*</span>
                    </label>
                    <select
                      {...register('escalafonId')}
                      defaultValue=""
                      className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                    >
                      <option value="" disabled>
                        Elegir...
                      </option>
                      {escalafonesOrdenados.map((e) => (
                        <option key={e.id} value={e.id}>
                          {escalafonLabel(e.nombre)}
                        </option>
                      ))}
                    </select>
                    {formState.errors.escalafonId && (
                      <p className="text-xs text-danger mt-1">{formState.errors.escalafonId.message}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Observaciones <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              {...register('observaciones')}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
          </div>

          {formError && (
            <div className="sm:col-span-2 bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">
              {formError}
            </div>
          )}

          <div className="sm:col-span-2">
            <button type="submit" disabled={formState.isSubmitting} className="btn-primary">
              {formState.isSubmitting ? 'Registrando...' : 'Registrar baja'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando bajas...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de bajas.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para los filtros aplicados.</p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Código Cargo</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Hospital</th>
                    <th className="px-4 py-3 font-semibold">Persona</th>
                    <th className="px-4 py-3 font-semibold">Motivo</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((b) => (
                    <Fragment key={b.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.fechaBaja.slice(0, 10)}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{b.cargo?.codigo ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{b.cargo?.literalPuesto ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{b.hospital?.sigla ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{b.persona?.apellidoNombre ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{b.motivo ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={ESTADO_BADGE[b.estado]}>{ESTADO_LABEL[b.estado]}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            className="btn-outline"
                            onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                          >
                            {expandedId === b.id ? 'Ocultar' : 'Ver'}
                          </button>
                        </td>
                      </tr>
                      {expandedId === b.id && (
                        <tr>
                          <td colSpan={8} className="px-4 py-3 bg-gray-50 text-sm text-gray-600">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <span className="text-gray-400 text-xs uppercase">Tipo de baja</span>
                                <p>{b.tipoBaja ?? '—'}</p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs uppercase">Tipificador de origen</span>
                                <p>{b.tipificadorOrigen ?? '—'}</p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs uppercase">Genera concurso</span>
                                <p>{b.generaConcurso ? 'Sí' : 'No'}</p>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs uppercase">Registrado por</span>
                                <p>{b.registradoPor?.username ?? '—'}</p>
                              </div>
                              {b.observaciones && (
                                <div className="col-span-2 sm:col-span-4">
                                  <span className="text-gray-400 text-xs uppercase">Observaciones</span>
                                  <p>{b.observaciones}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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

// Búsqueda async contra GET /api/v1/cargos (mismo endpoint que CargosPage) —
// 46k+ cargos no entran en un <select>. A diferencia del picker de persona
// (concursos-cph/ceetps), acá onChange devuelve el Cargo completo, no solo el
// id: el formulario necesita hospitalId también, y sacarlo del cargo elegido
// evita que alguien tipee un hospital distinto al del cargo real.
function CargoPicker({ value, onChange }: { value: string; onChange: (cargo: Cargo) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [seleccionLabel, setSeleccionLabel] = useState('')
  const debounced = useDebounce(query, 300)
  const { data } = useQuery({
    queryKey: ['cargos', 'picker', debounced],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Cargo[] }>('/api/v1/cargos', { params: { search: debounced, limit: 8 } })
      return res.data.data
    },
    enabled: !!debounced,
  })
  const resultados = debounced ? (data ?? []) : []

  return (
    <div className="relative">
      {value && !open && (
        <div className="flex items-center gap-2">
          <span className="w-full h-10 flex items-center px-3 border border-gray-300 rounded bg-gray-50 text-gray-700 flex-1">
            {seleccionLabel || value}
          </span>
          <button type="button" className="btn-outline" onClick={() => setOpen(true)}>
            Cambiar
          </button>
        </div>
      )}
      {(!value || open) && (
        <input
          type="text"
          placeholder="Buscar por código, puesto, especialidad..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
        />
      )}
      {open && debounced && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg">
          {resultados.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>}
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
              onClick={() => {
                onChange(c)
                setSeleccionLabel(`${c.codigo ?? c.idSial} — ${c.literalPuesto ?? 'sin puesto'}`)
                setQuery('')
                setOpen(false)
              }}
            >
              {c.codigo ?? c.idSial} <span className="text-gray-400">— {c.literalPuesto ?? 'sin puesto'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Igual patrón que el picker de persona designada de concursos-cph/ceetps —
// duplicado local a propósito, ver nota en esos archivos.
function PersonaPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [seleccionLabel, setSeleccionLabel] = useState('')
  const debounced = useDebounce(query, 300)
  const { data } = usePersonas({ search: debounced, limit: 8, page: 1 })
  const resultados: PersonaListItem[] = debounced ? (data?.data ?? []) : []

  return (
    <div className="relative">
      {value && !open && (
        <div className="flex items-center gap-2">
          <span className="w-full h-10 flex items-center px-3 border border-gray-300 rounded bg-gray-50 text-gray-700 flex-1">
            {seleccionLabel || value}
          </span>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              onChange('')
              setSeleccionLabel('')
            }}
          >
            Quitar
          </button>
        </div>
      )}
      {!value && (
        <input
          type="text"
          placeholder="Buscar persona por nombre, CUIL o DNI..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
        />
      )}
      {open && !value && debounced && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg">
          {resultados.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>}
          {resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
              onClick={() => {
                onChange(p.id)
                setSeleccionLabel(`${p.apellidoNombre} — CUIL ${p.cuil}`)
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
