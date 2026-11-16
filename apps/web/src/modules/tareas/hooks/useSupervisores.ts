import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface SupervisorSigla {
  hospitalId: string
  sigla: string
  nombre: string
}

export interface Supervisor {
  id: string
  username: string
  nombre: string | null
  apellido: string | null
  rolSlug: string
  siglas: SupervisorSigla[]
}

export interface HospitalItem {
  id: string
  sigla: string
  nombre: string
}

export function useSupervisores() {
  return useQuery({
    queryKey: ['usuarios', 'supervisores'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Supervisor[] }>('/api/v1/usuarios/supervisores')
      return res.data.data
    },
  })
}

export function useHospitalesActivos() {
  return useQuery({
    queryKey: ['hospitales', 'activos'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: HospitalItem[] }>('/api/v1/hospitales')
      return res.data.data
    },
  })
}

export function useAsignarSiglas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, hospitalIds }: { id: string; hospitalIds: string[] }) => {
      const res = await apiClient.put(`/api/v1/usuarios/${id}/siglas`, { hospitalIds })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios', 'supervisores'] }),
  })
}
