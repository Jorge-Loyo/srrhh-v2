import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Role } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Role[] }>('/api/v1/roles')
      return res.data.data
    },
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { nombre: string; descripcion?: string }) => {
      const res = await apiClient.post<{ data: Role }>('/api/v1/roles', body)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; nombre?: string; descripcion?: string | null; activo?: boolean }) => {
      const res = await apiClient.patch<{ data: Role }>(`/api/v1/roles/${id}`, body)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/roles/${id}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useSetRolePermisos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, permisoIds }: { id: string; permisoIds: string[] }) => {
      const res = await apiClient.put<{ data: Role }>(`/api/v1/roles/${id}/permisos`, { permisoIds })
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  })
}
