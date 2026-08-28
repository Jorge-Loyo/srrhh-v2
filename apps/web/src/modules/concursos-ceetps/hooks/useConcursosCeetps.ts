import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConcursoCeetps,
  ConcursoCeetpsFilters,
  PaginatedResponse,
  PatchConcursoCeetpsRequest,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { fetchAllPages } from '@/shared/lib/exportExcel'

// S5-2: listado paginado con filtros (GET /api/v1/concursos-ceetps, S5-1).
export function useConcursosCeetps(filters: ConcursoCeetpsFilters) {
  return useQuery({
    queryKey: ['concursos-ceetps', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<ConcursoCeetps>>('/api/v1/concursos-ceetps', {
        params: filters,
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

// S5-3: detalle completo (GET /api/v1/concursos-ceetps/:id).
export function useConcursoCeetps(id: string | undefined) {
  return useQuery({
    queryKey: ['concursos-ceetps', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ConcursoCeetps }>(`/api/v1/concursos-ceetps/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

// S5-3: guardar cambios por fase — `estado` lo recalcula el backend.
export function usePatchConcursoCeetps(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: PatchConcursoCeetpsRequest) => {
      const res = await apiClient.patch<{ data: ConcursoCeetps }>(`/api/v1/concursos-ceetps/${id}`, body)
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['concursos-ceetps', id], data)
      queryClient.invalidateQueries({ queryKey: ['concursos-ceetps'], exact: false })
    },
  })
}

// S5-9: trae TODOS los concursos CEETPS para calcular alertas de "sin
// movimiento" sobre el total — mismo patrón que useConcursosCphAlertas.
export function useConcursosCeetpsAlertas() {
  return useQuery({
    queryKey: ['concursos-ceetps', 'alertas'],
    queryFn: () =>
      fetchAllPages<ConcursoCeetps>(
        (page, limit) =>
          apiClient
            .get<PaginatedResponse<ConcursoCeetps>>('/api/v1/concursos-ceetps', { params: { page, limit } })
            .then((r) => r.data),
        200
      ),
    staleTime: 60_000,
  })
}
