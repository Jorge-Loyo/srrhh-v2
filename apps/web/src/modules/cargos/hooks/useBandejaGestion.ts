import { useQuery } from '@tanstack/react-query'
import type { ConcursoCph, ConcursoCphFilters, PaginatedResponse } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// PASO 1b (flujo concursos): fuente de datos MIXTA (CPH + CEETPS) para la tabla
// COMPLETA mudada a /cargos/concurso ("Gestión de Concursos"). Lee del endpoint
// rico GET /api/v1/concursos/bandeja-gestion, que devuelve filas con la MISMA
// forma que ConcursoCph para ambos tipos (las CEETPS traen null/vacío en los
// campos CPH-only). Firma compatible con useConcursosCph para enchufarse como
// prop `useData` de ConcursosListaTab sin ramas en el componente.
export function useBandejaGestion(filters: ConcursoCphFilters) {
  return useQuery({
    queryKey: ['bandeja-gestion', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<ConcursoCph>>(
        '/api/v1/concursos/bandeja-gestion',
        { params: filters },
      )
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}
