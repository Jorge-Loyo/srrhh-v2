import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

// Actualiza el código SAME (idSial) de un cargo ya creado.
export function usePatchCargoSame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, codigoSame }: { id: string; codigoSame: string }) => {
      const res = await apiClient.patch<{ data: Cargo }>(`/api/v1/cargos/${id}`, { codigoSame })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-alta'] })
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
    },
  })
}
