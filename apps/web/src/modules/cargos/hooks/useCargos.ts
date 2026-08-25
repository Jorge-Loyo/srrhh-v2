import { useQuery } from '@tanstack/react-query'
import type { Cargo, CargoDetail, CargoFilters, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// S3-4 + S3-3: listado paginado con filtros.
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

// S3-5: detalle con ocupación actual.
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
