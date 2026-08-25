import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateUsuarioRequest, Hospital, Usuario } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Usuario[] }>('/api/v1/usuarios')
      return res.data.data
    },
  })
}

// Lista de hospitales para el selector opcional del formulario — mismo
// endpoint que ya usa el resto de la app (hospitales.routes.ts).
export function useHospitales() {
  return useQuery({
    queryKey: ['hospitales'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Hospital[] }>('/api/v1/hospitales')
      return res.data.data
    },
  })
}

export function useCreateUsuario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateUsuarioRequest) => {
      const res = await apiClient.post<{ data: Usuario }>('/api/v1/usuarios', body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })
}

export function useSetUsuarioActivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const accion = activo ? 'activar' : 'desactivar'
      const res = await apiClient.patch<{ data: Usuario }>(`/api/v1/usuarios/${id}/${accion}`)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })
}
