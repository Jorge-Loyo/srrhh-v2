import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface DotacionRow {
  codigoCargo: string | null
  nombreApellido: string
  cuil: string
  sexo: string | null
  literalPuesto: string | null // nombre del puesto (catálogo)
  especialidad: string | null // nombre de la especialidad (catálogo)
  escalafon: string
  codigoRegistro: string | null
  regimen: string | null
  situacionRevista: string | null
  reparticion: string | null
  sigla: string
  codigoRol: string
  mailLaboral: string | null
  telefono: string | null
  provincia: string | null
  localidad: string | null
  edad: number | null
  antiguedad: number | null
}

// S21: /dotacion combina persona + cargo. Puesto/especialidad se ofrecen por
// NOMBRE del catálogo (buscables sobre todo el dataset filtrado). Se quitaron
// agrupador/unificadorPuesto (ya no existen en la dotación).
export interface DotacionDistinctValues {
  sexo: string[]
  situacionRevista: string[]
  reparticion: string[]
  regimen: string[]
  tipoOrigen: string[]
  especialidadCph: string[]
  provincia: string[]
  localidad: string[]
  puesto: string[]
  especialidad: string[]
}

export interface DotacionSiglasDistinctValues {
  sigla: string[]
  universoTotalizador: string[]
  tipoHospital: string[]
  monovalencia: string[]
}

export interface DotacionListResponse {
  rows: DotacionRow[]
  total: number
  page: number
  limit: number
  pages: number
  distinctValues?: DotacionDistinctValues
  // Código de registro con {id, nombre} — el filtro va por id (FK).
  codigoRegistro?: { id: string; nombre: string }[]
  siglasDistinctValues?: DotacionSiglasDistinctValues
}

// Filtros tal cual viajan a GET /api/v1/dotacion — los multi-select se pasan
// como array acá y se juntan en CSV recién al armar los params (ver
// dotacionQuerySchema en el backend, que espera "a,b,c").
export interface DotacionFilters {
  page: number
  limit: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  skipDistinct?: boolean
  sigla?: string[]
  universoTotalizador?: string[]
  tipoHospital?: string[]
  monovalencia?: string[]
  // S21: catálogo del cargo (multi-select combinable, NO cascada forzada).
  escalafonId?: string[]
  modalidad?: 'pof' | 'pou' | 'ambos'
  puestoNombre?: string[]
  especialidadNombre?: string[]
  codigoRegistroId?: string[]
  regimen?: string[]
  tipoOrigen?: string[]
  especialidadCph?: string[]
  provincia?: string[]
  localidad?: string[]
  soloJefes?: boolean
  sexo?: string[]
  situacionRevista?: string[]
  reparticion?: string[]
  codigoCargo?: string
  nombreApellido?: string
  cuil?: string
  codigoRol?: string
  edadMin?: number
  edadMax?: number
  antiguedadMin?: number
  antiguedadMax?: number
  estado?: string
}

const CSV_KEYS: (keyof DotacionFilters)[] = [
  'sigla', 'universoTotalizador', 'tipoHospital', 'monovalencia',
  'escalafonId', 'puestoNombre', 'especialidadNombre', 'codigoRegistroId',
  'regimen', 'tipoOrigen', 'especialidadCph', 'provincia', 'localidad',
  'sexo', 'situacionRevista', 'reparticion',
]

export function toDotacionParams(filters: DotacionFilters): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = { page: filters.page, limit: filters.limit }
  if (filters.sortBy) params.sortBy = filters.sortBy
  if (filters.sortDir) params.sortDir = filters.sortDir
  if (filters.skipDistinct) params.skipDistinct = 'true'
  for (const key of CSV_KEYS) {
    const v = filters[key] as string[] | undefined
    if (v?.length) params[key] = v.join(',')
  }
  if (filters.modalidad) params.modalidad = filters.modalidad
  if (filters.soloJefes) params.soloJefes = 'true'
  if (filters.codigoCargo) params.codigoCargo = filters.codigoCargo
  if (filters.nombreApellido) params.nombreApellido = filters.nombreApellido
  if (filters.cuil) params.cuil = filters.cuil
  if (filters.codigoRol) params.codigoRol = filters.codigoRol
  if (filters.edadMin !== undefined) params.edadMin = filters.edadMin
  if (filters.edadMax !== undefined) params.edadMax = filters.edadMax
  if (filters.antiguedadMin !== undefined) params.antiguedadMin = filters.antiguedadMin
  if (filters.antiguedadMax !== undefined) params.antiguedadMax = filters.antiguedadMax
  if (filters.estado) params.estado = filters.estado
  return params
}

export function useDotacion(filters: DotacionFilters) {
  return useQuery({
    queryKey: ['dotacion', filters],
    queryFn: async () => {
      const res = await apiClient.get<DotacionListResponse>('/api/v1/dotacion', { params: toDotacionParams(filters) })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export interface DotacionKpis {
  globales: { total: number; activos: number; retencion: number; comision: number; mujeres: number; varones: number }
  porSitRevista: { situacion: string; total: number }[]
  porEscalafon: { escalafonId: string; escalafon: string; total: number }[]
  porEfector: { hospitalId: string; sigla: string; total: number }[]
}

export function useDotacionKpis(hospitalId?: string) {
  return useQuery({
    queryKey: ['dotacion-kpis', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DotacionKpis }>('/api/v1/dotacion/kpis', {
        params: hospitalId ? { hospitalId } : {},
      })
      return res.data.data
    },
  })
}
