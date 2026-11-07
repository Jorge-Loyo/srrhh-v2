import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { CreateSolicitudAltaRequest, CreateSolicitudesAltaBatchRequest, PaginatedResponse, SolicitudAlta, SolicitudAltaEstado } from '@srrhh/types'

// S13-D — reemplaza el POST /api/v1/cargos directo de AltaCargosPage: ahora se
// crea una SolicitudAlta (pendiente de aprobación del director) en vez de un
// Cargo real. El Cargo se crea recién al aprobar (ver autorizaciones.service.ts
// del backend, _aprobarAltaCargo).

export interface SolicitudesAltaFilters {
  page?: number
  limit?: number
  hospitalId?: string
  estado?: SolicitudAltaEstado
  esTransferencia?: boolean
}

export function useSolicitudesAlta(filters: SolicitudesAltaFilters = {}) {
  return useQuery({
    queryKey: ['solicitudes-alta', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<SolicitudAlta>>('/api/v1/solicitudes-alta', {
        params: filters,
      })
      return res.data
    },
  })
}

export function useSolicitudAlta(id: string | null) {
  return useQuery({
    queryKey: ['solicitudes-alta', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SolicitudAlta }>(`/api/v1/solicitudes-alta/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreateSolicitudAlta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateSolicitudAltaRequest) => {
      const res = await apiClient.post<{ data: SolicitudAlta }>('/api/v1/solicitudes-alta', body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-alta'] })
      queryClient.invalidateQueries({ queryKey: ['autorizaciones'] })
    },
  })
}

// Descarga el PDF del GRUPO (unificado por expediente) desde el endpoint del
// backend. On-demand del dato actual: sirve tanto al modal de confirmación del
// alta como a la vista de Cargos Históricos. El expediente viaja como query
// param (puede traer barras, ej. decretos) y la respuesta es un blob PDF.
export async function descargarPdfGrupo(expediente: string): Promise<void> {
  const res = await apiClient.get('/api/v1/solicitudes-alta/grupo/pdf', {
    params: { expediente },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const safe = expediente.replace(/[^a-zA-Z0-9._-]/g, '_')
  const a = document.createElement('a')
  a.href = url
  a.download = `cargos_${safe}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Envío de "Cargos pendientes" como un LOTE: UNA request → UNA transacción en
// el backend que crea las N solicitudes + N autorizaciones. Reemplaza el loop
// de N requests que se pasaba del timeout de 5 s contra Neon.
export function useCreateSolicitudesAltaBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateSolicitudesAltaBatchRequest) => {
      const res = await apiClient.post<{ data: SolicitudAlta[] }>('/api/v1/solicitudes-alta/batch', body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-alta'] })
      queryClient.invalidateQueries({ queryKey: ['autorizaciones'] })
    },
  })
}
