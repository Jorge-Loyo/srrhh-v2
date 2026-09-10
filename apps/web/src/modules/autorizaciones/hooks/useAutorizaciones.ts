import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { Autorizacion, PaginatedResponse, TipoAutorizacion } from '@srrhh/types'

export interface AutorizacionesFilters {
  page?: number
  limit?: number
  tipo?: TipoAutorizacion
}

// ── Contador de pendientes (badge del header) — separado del de notificaciones ──
// `enabled` por defecto true; el header lo apaga con can(user,'autorizaciones','ver')
// para no pollear el endpoint en usuarios que nunca van a resolver nada.
export function useAutorizacionesPendientes(enabled = true) {
  return useQuery({
    queryKey: ['autorizaciones', 'mis-pendientes'],
    queryFn: async () => {
      const res = await apiClient.get<{ count: number }>('/api/v1/autorizaciones/mis-pendientes')
      return res.data.count
    },
    enabled,
    refetchInterval: 60_000,
  })
}

// ── Listado paginado — pendientes del rol del usuario logueado ──────────────────
export function useAutorizaciones(filters: AutorizacionesFilters = {}) {
  return useQuery({
    queryKey: ['autorizaciones', 'lista', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Autorizacion>>('/api/v1/autorizaciones', {
        params: filters,
      })
      return res.data
    },
  })
}

function invalidarTodo(queryClient: ReturnType<typeof useQueryClient>) {
  // Aprobar/rechazar puede tocar Cargo (alta), ConcursoCph, Notificacion — no
  // solo la lista propia de autorizaciones.
  queryClient.invalidateQueries({ queryKey: ['autorizaciones'] })
  queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
  queryClient.invalidateQueries({ queryKey: ['cargos'] })
  queryClient.invalidateQueries({ queryKey: ['solicitudes-alta'] })
  queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard'] })
  queryClient.invalidateQueries({ queryKey: ['concursos-cph'] })
}

export function useAprobarAutorizacion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, observaciones }: { id: string; observaciones?: string }) => {
      const res = await apiClient.post<{ data: unknown }>(`/api/v1/autorizaciones/${id}/aprobar`, { observaciones })
      return res.data.data
    },
    onSuccess: () => invalidarTodo(queryClient),
  })
}

export function useRechazarAutorizacion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, observaciones }: { id: string; observaciones?: string }) => {
      const res = await apiClient.post<{ data: Autorizacion }>(`/api/v1/autorizaciones/${id}/rechazar`, { observaciones })
      return res.data.data
    },
    onSuccess: () => invalidarTodo(queryClient),
  })
}
