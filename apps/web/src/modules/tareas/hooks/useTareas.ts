import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { EstadoTareaPendiente, PaginatedResponse, TareaPendiente } from '@srrhh/types'

export interface TareasFilters {
  page?: number
  limit?: number
  estado?: EstadoTareaPendiente
  tipo?: string
}

// ── Contador de pendientes (badge del header) ───────────────────────────────
// SIN gate de permiso — las tareas son de acción personal (propias + las de
// usuarios bajo el rol del logueado), así que siempre pollea.
export function useTareasPendientes(enabled = true) {
  return useQuery({
    queryKey: ['tareas', 'pendientes'],
    queryFn: async () => {
      const res = await apiClient.get<{ count: number }>('/api/v1/tareas/pendientes')
      return res.data.count
    },
    enabled,
    refetchInterval: 60_000,
  })
}

// ── Listado paginado — tareas visibles para el usuario logueado ─────────────
export function useTareas(filters: TareasFilters = {}) {
  return useQuery({
    queryKey: ['tareas', 'lista', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<TareaPendiente>>('/api/v1/tareas', {
        params: filters,
      })
      return res.data
    },
  })
}

// ── Marcar una tarea como resuelta ───────────────────────────────────────────
export function useResolverTarea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Body vacío a propósito: el backend exige Content-Type application/json
      // (requireJsonContentType); con `{}` axios lo setea. El endpoint no usa payload.
      const res = await apiClient.post<{ data: TareaPendiente }>(`/api/v1/tareas/${id}/resolver`, {})
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas'] })
    },
  })
}
