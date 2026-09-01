import { useQuery } from '@tanstack/react-query'
import type { Hospital, Escalafon, CodigoRegistro } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// Catálogos para selectores de filtro (PersonasPage, CargosPage, y lo que
// venga después). No cambian seguido — sin refetchInterval, cache normal de
// TanStack Query alcanza.
export function useHospitales() {
  return useQuery({
    queryKey: ['hospitales'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Hospital[] }>('/api/v1/hospitales')
      return res.data.data
    },
  })
}

export function useEscalafones(paraNuevaAlta = false) {
  return useQuery({
    queryKey: ['escalafones', paraNuevaAlta],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Escalafon[] }>('/api/v1/escalafones', {
        params: paraNuevaAlta ? { paraNuevaAlta: 'true' } : {},
      })
      return res.data.data
    },
  })
}

export function useCodigosRegistro() {
  return useQuery({
    queryKey: ['codigos-registro'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CodigoRegistro[] }>('/api/v1/codigos-registro')
      return res.data.data
    },
  })
}

export function usePuestosCargos(escalafonId?: string, hospitalId?: string) {
  return useQuery({
    queryKey: ['cargos-puestos', escalafonId, hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: string[] }>('/api/v1/cargos/puestos', {
        params: { ...(escalafonId && { escalafonId }), ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
  })
}

export function usePuestosCargoNormalizados(escalafonId?: string, modalidad?: 'pof' | 'pou' | 'ambos') {
  return useQuery({
    queryKey: ['puestos-cargo', escalafonId, modalidad],
    enabled: !!escalafonId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: string[] }>('/api/v1/puestos-cargo', {
        params: { ...(escalafonId && { escalafonId }), ...(modalidad && { modalidad }) },
      })
      return res.data.data
    },
  })
}

export function useEspecialidadesPuesto(escalafonId?: string, nombrePuesto?: string) {
  return useQuery({
    queryKey: ['especialidades-puesto', escalafonId, nombrePuesto],
    enabled: !!escalafonId && !!nombrePuesto,
    queryFn: async () => {
      const res = await apiClient.get<{ data: string[] }>('/api/v1/puestos-cargo/especialidades', {
        params: { escalafonId, nombre: nombrePuesto },
      })
      return res.data.data
    },
  })
}

// S7-7: historial persistente de altas manuales
export function useAltasCargos(params?: { expediente?: string; desde?: string; hasta?: string; page?: number }) {
  return useQuery({
    queryKey: ['cargos-altas', params],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: Array<{
          id: string; codigo: string | null; literalPuesto: string | null
          expediente: string | null; fechaDesde: string | null; createdAt: string
          hospital: { sigla: string; nombre: string }
          escalafon: { nombre: string }
          createdBy: { username: string } | null
        }>
        meta: { total: number; page: number; limit: number; pages: number }
      }>('/api/v1/cargos/altas', { params })
      return res.data
    },
  })
}
