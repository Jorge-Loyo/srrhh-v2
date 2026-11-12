import { useQuery } from '@tanstack/react-query'
import type { ConcursoBandejaItem, ConcursoBandejaFilters, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// PASO 1 (flujo concursos): bandeja mixta CPH + CEETPS de /cargos/concurso.
// Lee del endpoint nuevo GET /api/v1/concursos/bandeja (Concurso base). NO usa
// useConcursosCph ni useConcursosCeetps — esas siguen alimentando sus pantallas.
export function useBandejaConcursos(filters: ConcursoBandejaFilters) {
  return useQuery({
    queryKey: ['bandeja-concursos', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<ConcursoBandejaItem>>(
        '/api/v1/concursos/bandeja',
        { params: filters },
      )
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}
