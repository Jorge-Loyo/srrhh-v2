import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { CadenaRetencion, CandidatoRetencion, CargoRetenidoItem } from '@srrhh/types'

async function fetchCadenaRetencion(cargoId: string) {
  const res = await apiClient.get<{ data: CadenaRetencion }>(`/api/v1/retenciones/cadena/${cargoId}`)
  return res.data.data
}

export function useCadenaRetencion(cargoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['cadena-retencion', cargoId],
    queryFn: () => fetchCadenaRetencion(cargoId!),
    enabled: enabled && !!cargoId,
  })
}

async function fetchValidacionRetenciones() {
  const res = await apiClient.get<{ data: CandidatoRetencion[] }>('/api/v1/retenciones/validacion')
  return res.data.data
}

export function useValidacionRetenciones() {
  return useQuery({
    queryKey: ['validacion-retenciones'],
    queryFn: fetchValidacionRetenciones,
  })
}

async function fetchRetenidos() {
  const res = await apiClient.get<{ data: CargoRetenidoItem[] }>('/api/v1/retenciones/retenidos')
  return res.data.data
}

// Cargos ya retenidos (situacionRevista = 'Retencion de Cargo').
export function useRetenidos(enabled = true) {
  return useQuery({
    queryKey: ['retenciones-retenidos'],
    queryFn: fetchRetenidos,
    enabled,
  })
}
