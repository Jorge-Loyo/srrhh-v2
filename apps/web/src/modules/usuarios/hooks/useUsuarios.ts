import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateUsuarioRequest, Usuario } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// useHospitales se movió a shared/hooks/useCatalogos.ts (S3-6: personas y
// cargos también lo necesitan, no tiene sentido que vivan bajo el módulo de
// usuarios). Se re-exporta acá para no romper el import existente.
export { useHospitales } from '@/shared/hooks/useCatalogos'

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Usuario[] }>('/api/v1/usuarios')
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
