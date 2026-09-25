import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { ComisionInput } from '@srrhh/types'

function useInvalidar() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['personas'] })
    queryClient.invalidateQueries({ queryKey: ['validacion-retenciones'] })
    queryClient.invalidateQueries({ queryKey: ['retenciones-retenidos'] })
  }
}

export function useRegistrarComision() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (body: ComisionInput) => apiClient.post('/api/v1/comisiones', body),
    onSuccess: invalidar,
  })
}

export function useFinComision() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (ocupacionId: string) => apiClient.delete(`/api/v1/comisiones/${ocupacionId}`),
    onSuccess: invalidar,
  })
}
