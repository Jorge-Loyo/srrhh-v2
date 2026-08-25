import { useQuery } from '@tanstack/react-query'
import type { Hospital, Escalafon } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// Catálogos para selectores de filtro (PersonasPage, CargosPage, y lo que
// venga después). No cambian seguido — sin refetchInterval, cache normal de
// TanStack Query alcanza.
export function useHospitales() {
  return useQuery({
    queryKey: ['hospitales'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Hospital[] }>('/api/v1/hospitales')
      return res.data.data
    },
  })
}

export function useEscalafones() {
  return useQuery({
    queryKey: ['escalafones'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Escalafon[] }>('/api/v1/escalafones')
      return res.data.data
    },
  })
}
