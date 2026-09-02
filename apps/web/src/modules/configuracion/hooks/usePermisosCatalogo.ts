import { useQuery } from '@tanstack/react-query'
import type { Permiso } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

export function usePermisosCatalogo() {
  return useQuery({
    queryKey: ['permisos-catalogo'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Permiso[] }>('/api/v1/permisos')
      return res.data.data
    },
    staleTime: 5 * 60 * 1000, // el catálogo casi no cambia (solo con nuevas migraciones)
  })
}
