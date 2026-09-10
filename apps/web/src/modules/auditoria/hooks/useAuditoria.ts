import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface AuditoriaRow {
  id: string
  usuarioId: string | null
  username: string | null
  accion: string
  entidad: string
  entidadId: string | null
  cambios: unknown
  ip: string | null
  createdAt: string
}

export interface AuditoriaFilters {
  page: number
  limit: number
  accion?: string
  entidad?: string
  desde?: string
  hasta?: string
}

export interface AuditoriaResponse {
  data: AuditoriaRow[]
  meta: { total: number; page: number; limit: number; pages: number }
}

export function useAuditoria(filters: AuditoriaFilters) {
  return useQuery({
    queryKey: ['auditoria', filters],
    queryFn: async () => {
      const res = await apiClient.get<AuditoriaResponse>('/api/v1/auditoria', {
        params: {
          page: filters.page,
          limit: filters.limit,
          ...(filters.accion && { accion: filters.accion }),
          ...(filters.entidad && { entidad: filters.entidad }),
          ...(filters.desde && { desde: filters.desde }),
          ...(filters.hasta && { hasta: filters.hasta }),
        },
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export function usePurgarAuditoria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dias: number) => {
      const res = await apiClient.post<{ data: { purgados: number; fechaCorte: string } }>('/api/v1/auditoria/purgar', { dias })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditoria'] })
    },
  })
}
