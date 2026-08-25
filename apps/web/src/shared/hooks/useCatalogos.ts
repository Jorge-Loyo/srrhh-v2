import { useQuery } from '@tanstack/react-query'
import type { Hospital, Escalafon } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// Catálogos de referencia compartidos entre módulos (usuarios, personas,
// cargos, ...) — listas chicas y estables, se usan para poblar selects de
// filtro/formulario. staleTime largo: no hace falta refetchear seguido, un
// hospital/escalafón nuevo entra por la aprobación de un padrón (S2-7), no
// por una acción del usuario en estas páginas.
export function useHospitales() {
  return useQuery({
    queryKey: ['hospitales'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Hospital[] }>('/api/v1/hospitales')
      return res.data.data
    },
    staleTime: 5 * 60_000,
  })
}

export function useEscalafones() {
  return useQuery({
    queryKey: ['escalafones'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Escalafon[] }>('/api/v1/escalafones')
      return res.data.data
    },
    staleTime: 5 * 60_000,
  })
}
