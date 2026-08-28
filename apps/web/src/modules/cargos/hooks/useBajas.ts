import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Baja, BajaFilters, CreateBajaRequest, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// S5-6: listado paginado con filtros (GET /api/v1/bajas, S5-4).
export function useBajas(filters: BajaFilters) {
  return useQuery({
    queryKey: ['bajas', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Baja>>('/api/v1/bajas', { params: filters })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

// S5-6: crear baja (POST /api/v1/bajas, S5-4 + S5-7 — el backend marca el
// cargo no_vigente en la misma transacción). No hay S5-5 todavía (ver nota en
// bajas.service.ts): generaConcurso se guarda pero no dispara nada más acá.
export function useCreateBaja() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateBajaRequest) => {
      const res = await apiClient.post<{ data: Baja }>('/api/v1/bajas', body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bajas'] })
      // El cargo dado de baja pasa a no_vigente — invalida también el
      // listado de cargos para que CargosPage no muestre datos viejos si
      // ambas pantallas están abiertas.
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
    },
  })
}
