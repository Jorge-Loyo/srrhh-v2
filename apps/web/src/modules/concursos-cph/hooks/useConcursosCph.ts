import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConcursoCph,
  ConcursoCphFilters,
  DeclararDesiertoRequest,
  DesignarConcursoRequest,
  GenerarSorteoJuradoRequest,
  ImportarInscriptosResult,
  InscriptoConcurso,
  InscriptoRequest,
  PaginatedResponse,
  PatchConcursoCphRequest,
  SorteoJurado,
  SuspenderConcursoCphRequest,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { fetchAllPages } from '@/shared/lib/exportExcel'

// S4-7: listado paginado con filtros (GET /api/v1/concursos-cph, S4-1 de Jorge).
export function useConcursosCph(filters: ConcursoCphFilters) {
  return useQuery({
    queryKey: ['concursos-cph', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<ConcursoCph>>('/api/v1/concursos-cph', {
        params: filters,
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

// S4-10: trae TODOS los concursos CPH (no solo la página visible) para poder
// calcular alertas de "sin movimiento" correctas sobre el total, no solo
// sobre los 50 de la página actual. concursosCphQuerySchema tope `limit` en
// 200 (a diferencia de personas/cargos) — pageSize se ajusta a eso, igual que
// fetchAllPages ya hace para el export a Excel de PersonasPage/CargosPage.
// Volumen esperado: decenas/pocos cientos de concursos CPH (no 45k como
// personas), así que traer todo entero es barato.
export function useConcursosCphAlertas() {
  return useQuery({
    queryKey: ['concursos-cph', 'alertas'],
    queryFn: () =>
      fetchAllPages<ConcursoCph>(
        (page, limit) =>
          apiClient
            .get<PaginatedResponse<ConcursoCph>>('/api/v1/concursos-cph', { params: { page, limit } })
            .then((r) => r.data),
        200
      ),
    staleTime: 60_000,
  })
}

// S4-8: detalle completo (GET /api/v1/concursos-cph/:id, S4-2 de Jorge).
export function useConcursoCph(id: string | undefined) {
  return useQuery({
    queryKey: ['concursos-cph', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

// S4-8: guardar cambios por fase — estado/subEstado/subEstado3 los recalcula
// el backend (S4-4), no viajan en el body (ver PatchConcursoCphRequest).
export function usePatchConcursoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: PatchConcursoCphRequest) => {
      const res = await apiClient.patch<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}`, body)
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concursos-cph', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// S4-8: suspender/reanudar (POST /api/v1/concursos-cph/:id/suspender, S4-5).
export function useSuspenderConcursoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SuspenderConcursoCphRequest) => {
      const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/suspender`, body)
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concursos-cph', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// PS16D-6: declarar desierto (POST /api/v1/concursos-cph/:id/declarar-desierto).
export function useDeclararDesiertoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DeclararDesiertoRequest) => {
      const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/declarar-desierto`, body)
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-wizard', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}
export function useDesignarConcursoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DesignarConcursoRequest) => {
      const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/designar`, body)
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-wizard', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// Etapa 2 — acta del último sorteo de jurado (GET /:id/jurado). Devuelve null
// si aún no se generó ningún sorteo para el concurso.
export function useJuradoCph(id: string | undefined) {
  return useQuery({
    queryKey: ['concurso-cph-jurado', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SorteoJurado | null }>(`/api/v1/concursos-cph/${id}/jurado`)
      return res.data.data
    },
    enabled: !!id,
  })
}

// Etapa 2 — generar sorteo de jurado (POST /:id/generar-sorteo). Crea el acta
// + miembros y setea la fecha de sorteo en el concurso (avanza a B-SORTEO JUR).
export function useGenerarSorteoJurado(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: GenerarSorteoJuradoRequest) => {
      const res = await apiClient.post<{ data: SorteoJurado }>(`/api/v1/concursos-cph/${id}/generar-sorteo`, body)
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-jurado', id], data)
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// Etapa 2 — confirmar el sorteo (queda de solo lectura).
export function useConfirmarSorteoJurado(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: SorteoJurado }>(`/api/v1/concursos-cph/${id}/jurado/confirmar`, {})
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-jurado', id], data)
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// Etapa 2 — revertir la confirmación del sorteo (vuelve a borrador editable).
export function useRevertirConfirmacionSorteo(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: SorteoJurado }>(`/api/v1/concursos-cph/${id}/jurado/revertir`, {})
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-jurado', id], data)
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// Etapa 2 — cancelar (descartar) el sorteo vigente no confirmado.
export function useCancelarSorteoJurado(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete<{ data: { ok: boolean } }>(`/api/v1/concursos-cph/${id}/jurado`)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.setQueryData(['concurso-cph-jurado', id], null)
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// ── Etapa 3: inscriptos al concurso ──────────────────────────────────────────
export function useInscriptosCph(id: string | undefined) {
  return useQuery({
    queryKey: ['concurso-cph-inscriptos', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: InscriptoConcurso[] }>(`/api/v1/concursos-cph/${id}/inscriptos`)
      return res.data.data
    },
    enabled: !!id,
  })
}

// Al cambiar la lista de inscriptos, el backend recalcula qInscriptos del
// concurso, así que además invalidamos el detalle del wizard.
function invalidarInscriptos(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ['concurso-cph-inscriptos', id] })
  queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard', id] })
  queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
}

export function useCrearInscriptoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: InscriptoRequest) => {
      const res = await apiClient.post<{ data: InscriptoConcurso }>(`/api/v1/concursos-cph/${id}/inscriptos`, body)
      return res.data.data
    },
    onSuccess: () => invalidarInscriptos(queryClient, id),
  })
}

export function useActualizarInscriptoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ inscriptoId, body }: { inscriptoId: string; body: Partial<InscriptoRequest> }) => {
      const res = await apiClient.patch<{ data: InscriptoConcurso }>(`/api/v1/concursos-cph/${id}/inscriptos/${inscriptoId}`, body)
      return res.data.data
    },
    onSuccess: () => invalidarInscriptos(queryClient, id),
  })
}

export function useBorrarInscriptoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (inscriptoId: string) => {
      const res = await apiClient.delete<{ data: { ok: boolean } }>(`/api/v1/concursos-cph/${id}/inscriptos/${inscriptoId}`)
      return res.data.data
    },
    onSuccess: () => invalidarInscriptos(queryClient, id),
  })
}

export function useImportarInscriptosCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await apiClient.post<{ data: ImportarInscriptosResult }>(
        `/api/v1/concursos-cph/${id}/inscriptos/importar`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return res.data.data
    },
    onSuccess: () => invalidarInscriptos(queryClient, id),
  })
}

// Etapa 3 — publicar fechas de inscripción (cierra el período, avanza a D).
// Envía las fechas para guardarlas antes de cerrar.
export function useCerrarInscripcionCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fechas?: { fechaInscDesde?: string | null; fechaInscHasta?: string | null }) => {
      const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/inscripciones/cerrar`, fechas ?? {})
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-wizard', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// Etapa 3 — publicar / despublicar la fecha de examen.
export function usePublicarExamenCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fechaExamen?: string | null) => {
      const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/examen/publicar`, { fechaExamen })
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-wizard', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

export function useDespublicarExamenCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/examen/despublicar`, {})
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-wizard', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

export function useReabrirInscripcionCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/inscripciones/reabrir`, {})
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concurso-cph-wizard', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
    },
  })
}

// Etapa 3 — confirmar / revertir presentados al examen.
function accionEtapa3(id: string, path: string) {
  return async () => {
    const res = await apiClient.post<{ data: ConcursoCph }>(`/api/v1/concursos-cph/${id}/${path}`, {})
    return res.data.data
  }
}
function onSuccessEtapa3(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  return (data: ConcursoCph) => {
    queryClient.setQueryData(['concurso-cph-wizard', id], data)
    queryClient.invalidateQueries({ queryKey: ['concurso-cph-inscriptos', id] })
    queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
  }
}

export function useConfirmarPresentadosCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: accionEtapa3(id, 'presentados/confirmar'), onSuccess: onSuccessEtapa3(queryClient, id) })
}
export function useRevertirPresentadosCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: accionEtapa3(id, 'presentados/revertir'), onSuccess: onSuccessEtapa3(queryClient, id) })
}
export function useConfirmarOrdenMeritoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: accionEtapa3(id, 'orden-merito/confirmar'), onSuccess: onSuccessEtapa3(queryClient, id) })
}
export function useRevertirOrdenMeritoCph(id: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: accionEtapa3(id, 'orden-merito/revertir'), onSuccess: onSuccessEtapa3(queryClient, id) })
}
