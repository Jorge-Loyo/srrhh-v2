import { useQuery } from '@tanstack/react-query'
import type { PaginatedResponse, Persona, PersonaDetail, PersonaFilters } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// S3-1/S3-3 (Jorge): GET /personas ya devuelve { data, meta } directo (no
// envuelto en otro "data" — a diferencia de /padron/snapshots, acá el shape
// completo es la respuesta).
export function usePersonas(filters: PersonaFilters) {
  return useQuery({
    queryKey: ['personas', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Persona>>('/api/v1/personas', {
        params: filters,
      })
      return res.data
    },
    // mantiene la página anterior visible mientras llega la nueva — evita el
    // parpadeo a "cargando" en cada tecla del buscador o cambio de filtro.
    placeholderData: (prev) => prev,
  })
}

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
