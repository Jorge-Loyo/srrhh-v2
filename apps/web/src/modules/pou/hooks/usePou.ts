import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface PouRow {
  id: string
  sigla: string
  descripcionSigla: string | null
  perfil: string
  especialidad: string
  dotacionDiaria: number | null
  dotacionSem: number | null
  dotacionTotal: number | null
  activos: number | null
  tecnicos: number | null
  vacantes: number | null
}

// Siglas con datos POU cargados (no el catálogo completo de hospitales — solo
// los que efectivamente tienen filas en la tabla `pou`).
export function useHospitalesPou() {
  return useQuery({
    queryKey: ['pou', 'hospitales'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: string[] }>('/api/v1/pou/hospitales')
      return res.data.data
    },
  })
}

export function usePouPorSigla(sigla: string | null) {
  return useQuery({
    queryKey: ['pou', 'detalle', sigla],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PouRow[] }>('/api/v1/pou', { params: { sigla } })
      return res.data.data
    },
    enabled: !!sigla,
  })
}

export function usePouComparar(siglas: string[]) {
  return useQuery({
    queryKey: ['pou', 'comparar', siglas],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PouRow[] }>('/api/v1/pou/comparar', { params: { siglas: siglas.join(',') } })
      return res.data.data
    },
    enabled: siglas.length >= 2,
  })
}

// Módulo de carga (solo admin) — reemplaza toda la tabla `pou` desde un Excel.
export function useSubirPou() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiClient.post<{ data: { filas: number } }>('/api/v1/pou/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pou'] })
    },
  })
}
