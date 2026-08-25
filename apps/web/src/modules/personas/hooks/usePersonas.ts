import { useQuery } from '@tanstack/react-query'
import type { Persona, PersonaDetail, PersonaFilters, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// S3-1 + S3-3: listado paginado con full-text search + filtros.
export function usePersonas(filters: PersonaFilters) {
  return useQuery({
    queryKey: ['personas', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Persona>>('/api/v1/personas', {
        params: filters,
      })
      return res.data
    },
    // La página anterior se sigue mostrando mientras llega la nueva — evita
    // el parpadeo a "cargando" en cada tecla de búsqueda o cambio de página.
    placeholderData: (prev) => prev,
  })
}

// S3-2: detalle con ocupaciones.
export function usePersona(id: string | undefined) {
  return useQuery({
    queryKey: ['personas', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PersonaDetail }>(`/api/v1/personas/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}
