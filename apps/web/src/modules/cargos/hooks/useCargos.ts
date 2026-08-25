import { useQuery } from '@tanstack/react-query'
import type { Cargo, CargoDetail, CargoFilters, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// S3-4 (Jorge): GET /cargos devuelve { data, meta } directo, igual que /personas.
export function useCargos(filters: CargoFilters) {
  return useQuery({
    queryKey: ['cargos', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
        params: filters,
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export function useCargo(id: string | undefined) {
  return useQuery({
    queryKey: ['cargos', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargoDetail }>(`/api/v1/cargos/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}
