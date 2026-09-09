import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface OrganigramaPersona {
  personaId: string
  cargoId: string | null
  idSialRol: string | null
  codigoCargo: string | null
  nombre: string
  cargo: string | null
  cuil: string
  fechaNacimiento: string | null
  antiguedadDesde: string | null
  cargoDesde: string | null
  cargoHasta: string | null
}

export interface OrganigramaNodo {
  id: string
  nombre: string | null
  tipo: string
  nivel: number
  padre: string | null
  regimenEmpleo: string
  persona: OrganigramaPersona | null
  hijos: OrganigramaNodo[]
}

export type Seccion = 'nivel-central' | 'atencion-primaria'

// Uno solo de los dos — igual que valida el backend (organigrama.schema.ts).
type OrganigramaParams = { sigla: string; seccion?: undefined } | { seccion: Seccion; sigla?: undefined }

export function useOrganigrama(params: OrganigramaParams | null) {
  return useQuery({
    queryKey: ['organigrama', params],
    queryFn: async () => {
      const res = await apiClient.get<{ data: OrganigramaNodo }>('/api/v1/organigrama', { params })
      return res.data.data
    },
    enabled: !!params && (!!params.sigla || !!params.seccion),
    retry: false,
  })
}

// Módulo "Árbol" (solo admin) — reemplaza toda la estructura desde un Excel.
export function useSubirEstructuraOrganigrama() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiClient.post<{ data: { filas: number } }>('/api/v1/organigrama/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organigrama'] })
      queryClient.invalidateQueries({ queryKey: ['organigrama-uploads'] })
    },
  })
}

export interface OrganigramaUpload {
  id: string
  filename: string
  filas: number
  createdAt: string
  subidoPor: { username: string } | null
}

export function useOrganigramaUploads() {
  return useQuery({
    queryKey: ['organigrama-uploads'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: OrganigramaUpload[] }>('/api/v1/organigrama/uploads')
      return res.data.data
    },
  })
}
