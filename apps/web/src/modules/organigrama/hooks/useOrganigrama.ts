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
  sexo: string | null
  especialidadPersona: string | null
  mailLaboral: string | null
  telefono: string | null
  fechaNacimiento: string | null
  antiguedadDesde: string | null
  cargoDesde: string | null
  cargoHasta: string | null
  especialidadCargo: string | null
  escalafon: string | null
  hospital: string | null
}

export type RazonSinCargo = 'guardia_residencia_docente' | 'dato_incompleto' | 'sin_cargo'

export interface OrganigramaCargoVacante {
  cargoId: string
  codigoCargo: string | null
}

export interface OrganigramaNodo {
  id: string
  nombre: string | null
  tipo: string
  nivel: number
  padre: string | null
  regimenEmpleo: string
  persona: OrganigramaPersona | null
  cargoVacante: OrganigramaCargoVacante | null
  razonSinCargo: RazonSinCargo | null
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

// S24-9: vacantes de conducción = los nodos que el organigrama muestra como
// "Vacante" (mismo criterio que el contador del árbol).
export interface VacanteConduccion {
  cargoId: string | null
  codigo: string | null
  codigoRepa: string
  descripcionRepa: string | null
  hospitalSigla: string
  hospitalNombre: string
  nivel: string
  carrera: string
  puestoLiteral: string
  frio: boolean // nodo sin cargo real detrás todavía
  revisionMotivo: string | null
}

export interface VacantesConduccion {
  total: number
  conCodigo: number
  frias: number
  porHospital: { sigla: string; nombre: string; total: number }[]
  porNivel: { nivel: string; total: number }[]
  porPuesto: { puesto: string; total: number }[]
  puestoFiltrado: string | null
  vacantes: VacanteConduccion[]
}

export function useVacantesConduccion(opts: { sigla?: string; puesto?: string } = {}) {
  const { sigla, puesto } = opts
  return useQuery({
    queryKey: ['vacantes-conduccion', sigla ?? null, puesto ?? null],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (sigla) params.sigla = sigla
      if (puesto) params.puesto = puesto
      const res = await apiClient.get<{ data: VacantesConduccion }>('/api/v1/organigrama/vacantes', {
        params: Object.keys(params).length ? params : undefined,
      })
      return res.data.data
    },
  })
}

// S24-7 (complemento): cargos de conducción huérfanos (nodo eliminado del árbol).
export interface CargoHuerfano {
  cargoId: string
  codigo: string | null
  codigoRepa: string | null
  descripcionRepa: string | null
  estado: string
  frio: boolean
  hospitalSigla: string
  hospitalNombre: string
  tieneOcupacionesVigentes: boolean
}

export interface CargosHuerfanos {
  total: number
  cargos: CargoHuerfano[]
}

export function useCargosConduccionHuerfanos() {
  return useQuery({
    queryKey: ['cargos-conduccion-huerfanos'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargosHuerfanos }>('/api/v1/organigrama/cargos-huerfanos')
      return res.data.data
    },
  })
}
