import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { Notificacion, NotificacionFilters, PaginatedResponse } from '@srrhh/types'

// ── Contador de no leídas (badge del header) ─────────────────────────────────
export function useNotificacionesNoLeidas() {
  return useQuery({
    queryKey: ['notificaciones', 'no-leidas'],
    queryFn: async () => {
      const res = await apiClient.get<{ count: number }>('/api/v1/notificaciones/no-leidas')
      return res.data.count
    },
    refetchInterval: 60_000, // refresca cada minuto
  })
}

// ── Listado paginado ──────────────────────────────────────────────────────────
export function useNotificaciones(filters: NotificacionFilters = {}) {
  return useQuery({
    queryKey: ['notificaciones', 'lista', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Notificacion>>(
        '/api/v1/notificaciones',
        { params: filters }
      )
      return res.data
    },
  })
}

// ── Marcar una como leída ─────────────────────────────────────────────────────
export function useMarcarLeida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch<{ data: Notificacion }>(`/api/v1/notificaciones/${id}/leer`)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

// ── Marcar todas como leídas ──────────────────────────────────────────────────
export function useMarcarTodasLeidas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.patch<{ actualizadas: number }>('/api/v1/notificaciones/leer-todas')
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}
