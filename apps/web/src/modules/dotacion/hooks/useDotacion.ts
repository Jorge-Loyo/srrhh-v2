import { useMutation, useQuery } from '@tanstack/react-query'
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
  grupoEspecialidad: string[]
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
  // Código de registro con {id, codigo, nombre} — el filtro va por id (FK).
  // `codigo` es el código real (24, 37...); `nombre` el literal/escalafón.
  codigoRegistro?: { id: string; codigo: string; nombre: string }[]
  siglasDistinctValues?: DotacionSiglasDistinctValues
}

// Un grupo de la UNIÓN (OR): subconjunto de dimensiones del filtro combinadas
// con AND dentro del grupo. Varios grupos se combinan con OR en el backend.
// Mismas dimensiones que DotacionFilters (sin paginación/búsqueda/rangos).
export interface GrupoDotacion {
  sigla?: string[]
  universoTotalizador?: string[]
  tipoHospital?: string[]
  monovalencia?: string[]
  escalafonId?: string[]
  modalidad?: 'pof' | 'pou' | 'ambos'
  puestoNombre?: string[]
  especialidadNombre?: string[]
  grupoEspecialidad?: string[]
  codigoRegistroId?: string[]
  regimen?: string[]
  tipoOrigen?: string[]
  especialidadCph?: string[]
  provincia?: string[]
  localidad?: string[]
  sexo?: string[]
  situacionRevista?: string[]
  reparticion?: string[]
  // S23-6/S23-8: Área Programática / CeSAC / unidad fija.
  areaProgramaticaId?: string[]
  cesacId?: string[]
  unidadFijaId?: string[]
  // Snapshot de etiquetas legibles para los chips (NO viaja al backend).
  labels?: string[]
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
  // Uniones (OR). Cada grupo es un AND de sus dimensiones.
  grupos?: GrupoDotacion[]
  sigla?: string[]
  universoTotalizador?: string[]
  tipoHospital?: string[]
  monovalencia?: string[]
  // S21: catálogo del cargo (multi-select combinable, NO cascada forzada).
  escalafonId?: string[]
  modalidad?: 'pof' | 'pou' | 'ambos'
  puestoNombre?: string[]
  especialidadNombre?: string[]
  grupoEspecialidad?: string[]
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
  // S23-6/S23-8: Área Programática / CeSAC / unidad fija (CEMAR/COI/Red Odonto).
  areaProgramaticaId?: string[]
  cesacId?: string[]
  unidadFijaId?: string[]
  codigoCargo?: string
  nombreApellido?: string
  cuil?: string
  codigoRol?: string
  edadMin?: number
  edadMax?: number
  antiguedadMin?: number
  antiguedadMax?: number
  estado?: string
  // Fecha de corte 'YYYY-MM' (foto histórica). Vacío = estado actual.
  mesCorte?: string
}

const CSV_KEYS: (keyof DotacionFilters)[] = [
  'sigla', 'universoTotalizador', 'tipoHospital', 'monovalencia',
  'escalafonId', 'puestoNombre', 'especialidadNombre', 'grupoEspecialidad', 'codigoRegistroId',
  'regimen', 'tipoOrigen', 'especialidadCph', 'provincia', 'localidad',
  'sexo', 'situacionRevista', 'reparticion',
  'areaProgramaticaId', 'cesacId', 'unidadFijaId',
]

// Serializa los grupos de unión al JSON que espera el backend: dimensiones con
// valores (arrays no vacíos / modalidad), sin `labels` ni claves vacías.
export function serializarGruposDotacion(grupos: GrupoDotacion[]): string {
  const limpios = grupos.map((g) => {
    const o: Record<string, string[] | string> = {}
    for (const [k, v] of Object.entries(g)) {
      if (k === 'labels') continue
      if (Array.isArray(v)) {
        if (v.length) o[k] = v
      } else if (v) {
        o[k] = v
      }
    }
    return o
  })
  return JSON.stringify(limpios)
}

export function toDotacionParams(filters: DotacionFilters): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = { page: filters.page, limit: filters.limit }
  if (filters.sortBy) params.sortBy = filters.sortBy
  if (filters.sortDir) params.sortDir = filters.sortDir
  if (filters.skipDistinct) params.skipDistinct = 'true'
  if (filters.grupos?.length) params.grupos = serializarGruposDotacion(filters.grupos)
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
  if (filters.mesCorte) params.mesCorte = filters.mesCorte
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

// Exporta a Excel TODO el resultado del filtro actual (server-side, sin
// paginar). Reusa los mismos filtros/uniones que el listado via toDotacionParams
// (se descarta la paginación). Patrón blob → <a download>.
export function useExportDotacion() {
  return useMutation({
    mutationFn: async (filters: DotacionFilters) => {
      const { page: _p, limit: _l, skipDistinct: _s, ...resto } = filters
      const params = toDotacionParams({ ...resto, page: 1, limit: 1 })
      delete (params as Record<string, unknown>).page
      delete (params as Record<string, unknown>).limit
      const res = await apiClient.get('/api/v1/dotacion/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dotacion_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    },
  })
}

// Meses disponibles para el selector de "Fecha de corte" (foto histórica).
// Cada uno es el cierre de un mes con padrón aprobado.
export interface DotacionCorte {
  mes: string // 'YYYY-MM'
  corte: string // fecha ISO del snapshot de cierre
}

export function useDotacionCortes() {
  return useQuery({
    queryKey: ['dotacion-cortes'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DotacionCorte[] }>('/api/v1/dotacion/cortes')
      return res.data.data
    },
  })
}
