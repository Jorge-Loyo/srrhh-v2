import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConcursoCph,
  ConcursoCphFilters,
  PaginatedResponse,
  PatchConcursoCphRequest,
  SuspenderConcursoCphRequest,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

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
