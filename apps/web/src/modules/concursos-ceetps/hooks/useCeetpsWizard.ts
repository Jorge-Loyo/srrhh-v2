import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DesignarConcursoRequest, InscriptoCeetpsDto, JuradoCeetpsDto } from '@srrhh/types'
import type * as Cph from '@/modules/concursos-cph/hooks/useConcursosCph'
import { apiClient } from '@/shared/lib/api-client'

// Hooks del wizard CEETPS, con los MISMOS nombres y tipos que los de
// concursos-cph/hooks/useConcursosCph: el wizard CEETPS es una copia del de CPH
// y los importa de acá en lugar de allá. Lo que CEETPS ya tiene en el backend
// (designar, jurado, inscriptos) está conectado; el resto (desierto,
// suspender, estado de la designación) todavía no existe para CEETPS: las consultas
// quedan vacías y las acciones avisan que no están disponibles. Se conectan a
// medida que se adapta cada etapa.

export const CEETPS_WIZARD_KEY = 'concurso-ceetps-wizard'

const MENSAJE_NO_DISPONIBLE = 'Esta acción todavía no está disponible para concursos CEETPS.'

// Error con la forma de un error de axios, para que los onError del wizard
// (que leen response.data.message) muestren el aviso.
function noDisponible(): Promise<never> {
  const err = Object.assign(new Error(MENSAJE_NO_DISPONIBLE), {
    response: { data: { message: MENSAJE_NO_DISPONIBLE, error: { message: MENSAJE_NO_DISPONIBLE } } },
  })
  return Promise.reject(err)
}

function useAccionNoDisponible<T>(): T {
  return useMutation({ mutationFn: noDisponible }) as unknown as T
}

function useConsultaVacia<T>(nombre: string, id?: string): T {
  return useQuery({ queryKey: ['ceetps-wizard-sin-datos', nombre, id], queryFn: () => null, enabled: false }) as unknown as T
}

// ── Conectado al backend CEETPS ──────────────────────────────────────────────

export function useDesignarConcursoCph(id: string): ReturnType<typeof Cph.useDesignarConcursoCph> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DesignarConcursoRequest) => {
      const res = await apiClient.post(`/api/v1/concursos-ceetps/${id}/designar`, {
        personaId: body.personaId,
        fechaDesde: body.fechaDesde,
        ...(body.idSialRol ? { idSialRol: body.idSialRol } : {}),
      })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CEETPS_WIZARD_KEY, id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-ceetps'], exact: false })
    },
  }) as unknown as ReturnType<typeof Cph.useDesignarConcursoCph>
}

// ── Etapa 2: jurado asignado a mano (reemplaza el sorteo de CPH) ─────────────

const juradoKey = (id: string | undefined) => [CEETPS_WIZARD_KEY, id, 'jurado'] as const

export function useJuradoCeetps(id: string | undefined) {
  return useQuery({
    queryKey: juradoKey(id),
    queryFn: async () => {
      const res = await apiClient.get<{ data: JuradoCeetpsDto }>(
        `/api/v1/concursos-ceetps/${id}/jurado`,
      )
      return res.data.data
    },
    enabled: !!id,
  })
}

// Las tres escrituras devuelven el jurado actualizado: se pisa la caché con la
// respuesta en vez de volver a pedirlo.
function useEscrituraJurado<V>(id: string, request: (vars: V) => Promise<JuradoCeetpsDto>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (jurado) => queryClient.setQueryData(juradoKey(id), jurado),
  })
}

export function useGuardarCantidadesJuradoCeetps(id: string) {
  return useEscrituraJurado(id, async (body: { cantTitulares: number; cantSuplentes: number }) => {
    const res = await apiClient.put<{ data: JuradoCeetpsDto }>(
      `/api/v1/concursos-ceetps/${id}/jurado/cantidades`,
      body,
    )
    return res.data.data
  })
}

export function useAgregarMiembroJuradoCeetps(id: string) {
  return useEscrituraJurado(id, async (body: { personaId: string; rol: 'titular' | 'suplente' }) => {
    const res = await apiClient.post<{ data: JuradoCeetpsDto }>(
      `/api/v1/concursos-ceetps/${id}/jurado/miembros`,
      body,
    )
    return res.data.data
  })
}

export function useQuitarMiembroJuradoCeetps(id: string) {
  return useEscrituraJurado(id, async (miembroId: string) => {
    const res = await apiClient.delete<{ data: JuradoCeetpsDto }>(
      `/api/v1/concursos-ceetps/${id}/jurado/miembros/${miembroId}`,
    )
    return res.data.data
  })
}

// ── Etapa 3: inscriptos y pasos del concurso ─────────────────────────────────

const inscriptosKey = (id: string | undefined) => [CEETPS_WIZARD_KEY, id, 'inscriptos'] as const

export function useInscriptosCeetps(id: string | undefined) {
  return useQuery({
    queryKey: inscriptosKey(id),
    queryFn: async () => {
      const res = await apiClient.get<{ data: InscriptoCeetpsDto[] }>(
        `/api/v1/concursos-ceetps/${id}/inscriptos`,
      )
      return res.data.data
    },
    enabled: !!id,
  })
}

export type InscriptoCeetpsCambios = Partial<
  Omit<
    InscriptoCeetpsDto,
    | 'id'
    | 'concursoCeetpsId'
    | 'pasaAdmision'
    | 'pasaExamen'
    | 'pasaCv'
    | 'pasaEntrevista'
    | 'finalista'
    | 'empate'
    | 'ordenMerito'
    | 'createdAt'
    | 'updatedAt'
  >
>

function useEscrituraInscriptos<V>(id: string, request: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inscriptosKey(id) }),
  })
}

export function useCrearInscriptoCeetps(id: string) {
  return useEscrituraInscriptos(
    id,
    (body: InscriptoCeetpsCambios & { apellido: string; nombre: string }) =>
      apiClient.post(`/api/v1/concursos-ceetps/${id}/inscriptos`, body),
  )
}

export function useActualizarInscriptoCeetps(id: string) {
  return useEscrituraInscriptos(
    id,
    ({ inscriptoId, cambios }: { inscriptoId: string; cambios: InscriptoCeetpsCambios }) =>
      apiClient.patch(`/api/v1/concursos-ceetps/${id}/inscriptos/${inscriptoId}`, cambios),
  )
}

export interface ResultadoImportacionCeetps {
  creados: number
  actualizados: number
  errores: { fila: number; motivo: string }[]
}

// Importa un paso desde las filas de un Excel (el backend las interpreta y valida).
export function useImportarInscriptosCeetps(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      paso: string
      filas: Record<string, string | number | boolean | null>[]
    }) => {
      const res = await apiClient.post<{ data: ResultadoImportacionCeetps }>(
        `/api/v1/concursos-ceetps/${id}/inscriptos/importar`,
        body,
      )
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inscriptosKey(id) }),
  })
}

// "Todos entregaron documentación": marca (o desmarca) a todos los inscriptos.
export function useMarcarDocumentacionCeetps(id: string) {
  return useEscrituraInscriptos(id, (entregoDocumentacion: boolean) =>
    apiClient.post(`/api/v1/concursos-ceetps/${id}/inscriptos/documentacion`, {
      entregoDocumentacion,
    }),
  )
}

export function useEliminarInscriptoCeetps(id: string) {
  return useEscrituraInscriptos(id, (inscriptoId: string) =>
    apiClient.delete(`/api/v1/concursos-ceetps/${id}/inscriptos/${inscriptoId}`),
  )
}

// PATCH directo del concurso (puntajes mínimos, cronograma), sin pasar por el
// adaptador CPH del wizard. Invalida todo el concurso: cambiar un mínimo
// recalcula quién aprobó cada paso.
export function usePatchConcursoCeetps(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.patch(`/api/v1/concursos-ceetps/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CEETPS_WIZARD_KEY, id] }),
  })
}

// ── Consultas sin equivalente CEETPS todavía ─────────────────────────────────

export const useDesignacionEstado = (id: string | undefined, _enabled = true) =>
  useConsultaVacia<ReturnType<typeof Cph.useDesignacionEstado>>('designacion-estado', id)

// ── Acciones sin equivalente CEETPS todavía ──────────────────────────────────

// Etapa 5: vincula al designado (persona o referencia CUIL + nombre) sin ocupar el cargo.
export function useAsignarDesignadoCph(id: string): ReturnType<typeof Cph.useAsignarDesignadoCph> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiClient.post(`/api/v1/concursos-ceetps/${id}/asignar-designado`, body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CEETPS_WIZARD_KEY, id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-ceetps'], exact: false })
    },
  }) as unknown as ReturnType<typeof Cph.useAsignarDesignadoCph>
}
export const useDeclararDesiertoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useDeclararDesiertoCph>>()
export const useSuspenderConcursoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useSuspenderConcursoCph>>()

// ── Etapa 5: candidato no apto + historial ───────────────────────────────────

export interface HistorialDesignacionCeetps {
  id: string
  apellidoNombre: string
  cuil: string | null
  motivo: string
  numeroNota: string | null
  datos: Record<string, unknown>
  createdAt: string
}

const historialKey = (id: string | undefined) => [CEETPS_WIZARD_KEY, id, 'historial-designacion'] as const

export function useHistorialDesignacionCeetps(id: string | undefined) {
  return useQuery({
    queryKey: historialKey(id),
    queryFn: async () => {
      const res = await apiClient.get<{ data: HistorialDesignacionCeetps[] }>(
        `/api/v1/concursos-ceetps/${id}/designacion/historial`,
      )
      return res.data.data
    },
    enabled: !!id,
  })
}

// El candidato no fue apto: se guarda su historial y el concurso vuelve a la Etapa 4.
export function useNoAptoCeetps(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(`/api/v1/concursos-ceetps/${id}/designacion/no-apto`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CEETPS_WIZARD_KEY, id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-ceetps'], exact: false })
    },
  })
}
