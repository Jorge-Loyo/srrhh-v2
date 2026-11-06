import { useQuery } from '@tanstack/react-query'
import type { Cargo, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// Paso A flujo concursos: filtros de la vista "Nuevos cargos" (GET
// /api/v1/cargos/nuevos). El criterio de visibilidad fijo (cargos de alta
// vigentes vacante/concurso) lo impone el backend; acá solo se exponen los
// filtros de pantalla (búsqueda, hospital, sub-estado).
export interface NuevosCargosFilters {
  page: number
  limit: number
  search?: string
  hospitalId?: string
  subEstado?: 'vacante' | 'concurso'
}

// Lee la vista de cargos de alta por concursar / en concurso, ordenados por
// expediente. El payload tiene la MISMA forma que `Cargo` (reusa el mapeo de
// listCargosService en el backend).
export function useNuevosCargos(filters: NuevosCargosFilters) {
  return useQuery({
    queryKey: ['cargos-nuevos', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos/nuevos', {
        params: filters,
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}
