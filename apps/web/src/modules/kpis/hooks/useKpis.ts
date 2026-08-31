import { useQuery } from '@tanstack/react-query'
import type { KpiDotacion, KpiConcursos } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// S6-2: KpisPage consume estos dos endpoints (S6-1/S6-3 de Jorge) para
// armar el tablero. staleTime de 60s — son agregados sobre miles de filas,
// no hace falta refetchear en cada foco de ventana como sí pasa con los
// listados paginados (padrón/personas/cargos).
export function useKpiDotacion(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'dotacion', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiDotacion }>('/api/v1/kpis/dotacion', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useKpiConcursos(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'concursos', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiConcursos }>('/api/v1/kpis/concursos', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}
