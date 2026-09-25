import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { RenovarPeriodoRequest, VencimientoCargo } from '@srrhh/types'

async function fetchVencimientos() {
  const res = await apiClient.get<{ data: VencimientoCargo[] }>('/api/v1/retenciones/vencimientos')
  return res.data.data
}

// Cargos TTR vigentes con período por vencer, ordenados por días restantes.
export function useVencimientos(enabled = true) {
  return useQuery({
    queryKey: ['retenciones-vencimientos'],
    queryFn: fetchVencimientos,
    enabled,
  })
}

export function useRenovarPeriodo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ cargoId, ...body }: RenovarPeriodoRequest & { cargoId: string }) =>
      apiClient.patch(`/api/v1/retenciones/${cargoId}/renovar`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retenciones-vencimientos'] })
      queryClient.invalidateQueries({ queryKey: ['retenciones-retenidos'] })
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}
