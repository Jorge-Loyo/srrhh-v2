import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { NuevosCargosResponse, TipoConcursoNuevo } from '../lib/nuevosCargos'

// Paso 4 flujo concursos: filtros de la pestaña "Nuevos cargos" (GET
// /api/v1/cargos/nuevos). El criterio de "sin iniciar" lo impone el backend.
export interface NuevosCargosFilters {
  search?: string
  hospitalId?: string
  tipo?: TipoConcursoNuevo
}

// Concursos de cargo nuevo sin iniciar (CPH + CEETPS), agrupados por expediente
// del alta, más los cargos nuevos que no tienen concurso (informativo).
export function useNuevosCargos(filters: NuevosCargosFilters) {
  return useQuery({
    queryKey: ['cargos-nuevos', filters],
    queryFn: async () => {
      const res = await apiClient.get<NuevosCargosResponse>('/api/v1/cargos/nuevos', {
        params: filters,
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}
