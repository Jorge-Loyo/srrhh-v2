import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface TokenRow {
  id: string
  usuarioId: string
  username: string
  familyId: string
  expiresAt: string
  revocado: boolean
  createdAt: string
}

export interface TokensFilters {
  page: number
  limit: number
  username?: string
  activo?: boolean
}

export interface TokensResponse {
  data: TokenRow[]
  meta: { total: number; page: number; limit: number; pages: number }
}

export function useTokens(filters: TokensFilters) {
  return useQuery({
    queryKey: ['tokens', filters],
    queryFn: async () => {
      const res = await apiClient.get<TokensResponse>('/api/v1/tokens', {
        params: {
          page: filters.page,
          limit: filters.limit,
          ...(filters.username && { username: filters.username }),
          ...(filters.activo !== undefined && { activo: String(filters.activo) }),
        },
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export function useRevokeToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch(`/api/v1/tokens/${id}/revocar`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })
}

export function useRevokeAllForUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (usuarioId: string) => {
      const res = await apiClient.patch(`/api/v1/tokens/usuario/${usuarioId}/revocar-todos`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })
}
