import { useQuery } from '@tanstack/react-query'
import type {
  KpiDotacion,
  KpiConcursos,
  KpiAlertas,
  KpiBajas,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// NOTA: los hooks de "Evolución de dotación" (`useKpiDotacionHistorica`,
// `useDotacionEvolucion`, `useDotacionEvolucionOpciones`,
// `useExportDotacionEvolucion`) y sus helpers privados se mudaron a
// `modules/reportes/hooks/useReportes.ts` junto con los componentes que los
// usan. Acá quedan solo los hooks que sigue consumiendo el Tablero de KPIs.

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

// S6-6: concursos vencidos + bajas sin concurso.
export function useKpiAlertas(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'alertas', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiAlertas }>('/api/v1/kpis/alertas', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useKpiBajas(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'bajas', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiBajas }>('/api/v1/kpis/bajas', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}
