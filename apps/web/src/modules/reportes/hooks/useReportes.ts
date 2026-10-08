import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

// Dimensiones categóricas agrupables — debe reflejar REPORTES_GROUP_BY_COLUMNS
// en apps/api/src/modules/reportes/reportes.schema.ts.
export const REPORTES_GROUP_BY_OPTIONS = [
  { key: 'sigla', label: 'Hospital' },
  { key: 'universoTotalizador', label: 'Universo' },
  { key: 'tipoHospital', label: 'Tipo Hospital' },
  { key: 'monovalencia', label: 'Monovalencia' },
  { key: 'escalafon', label: 'Carrera' },
  { key: 'literalPuesto', label: 'Puesto' },
  { key: 'especialidad', label: 'Especialidad' },
  { key: 'sexo', label: 'Sexo' },
  { key: 'situacionRevista', label: 'Situación de Revista' },
  { key: 'reparticion', label: 'Repartición' },
] as const

export type ReporteGroupByKey = (typeof REPORTES_GROUP_BY_OPTIONS)[number]['key']

// Mismo set de filtros que DotacionFilters (ver
// apps/web/src/modules/dotacion/hooks/useDotacion.ts), sin page/limit/sortBy.
export interface ReporteDotacionFilters {
  sigla?: string[]
  universoTotalizador?: string[]
  tipoHospital?: string[]
  monovalencia?: string[]
  puestoNombre?: string[]
  especialidadNombre?: string[]
  escalafonId?: string[]
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

export interface ReporteDotacionQuery extends ReporteDotacionFilters {
  groupBy1: ReporteGroupByKey
  groupBy2?: ReporteGroupByKey
}

export interface ReporteDotacionRow {
  dim1: string
  dim2: string | null
  total: number
}

export interface ReporteDotacionResponse {
  groupBy1: ReporteGroupByKey
  groupBy2: ReporteGroupByKey | null
  grandTotal: number
  rows: ReporteDotacionRow[]
}

const CSV_KEYS: (keyof ReporteDotacionFilters)[] = [
  'sigla', 'universoTotalizador', 'tipoHospital', 'monovalencia',
  'puestoNombre', 'especialidadNombre',
  'escalafonId', 'sexo', 'situacionRevista', 'reparticion',
]

export function toReporteDotacionParams(query: ReporteDotacionQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { groupBy1: query.groupBy1 }
  if (query.groupBy2) params.groupBy2 = query.groupBy2
  for (const key of CSV_KEYS) {
    const v = query[key] as string[] | undefined
    if (v?.length) params[key] = v.join(',')
  }
  if (query.codigoCargo) params.codigoCargo = query.codigoCargo
  if (query.nombreApellido) params.nombreApellido = query.nombreApellido
  if (query.cuil) params.cuil = query.cuil
  if (query.codigoRol) params.codigoRol = query.codigoRol
  if (query.edadMin !== undefined) params.edadMin = query.edadMin
  if (query.edadMax !== undefined) params.edadMax = query.edadMax
  if (query.antiguedadMin !== undefined) params.antiguedadMin = query.antiguedadMin
  if (query.antiguedadMax !== undefined) params.antiguedadMax = query.antiguedadMax
  if (query.estado) params.estado = query.estado
  return params
}

// Reporte "en vivo": se recalcula solo con cada cambio de filtros/agrupación
// (sin botón "Generar"). placeholderData mantiene la tabla anterior visible
// mientras llega la nueva, en vez de parpadear a vacío en cada cambio.
export function useReporteDotacion(query: ReporteDotacionQuery) {
  return useQuery({
    queryKey: ['reporte-dotacion', query],
    queryFn: async () => {
      const res = await apiClient.get<ReporteDotacionResponse>('/api/v1/reportes/dotacion', {
        params: toReporteDotacionParams(query),
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Evolutivo por Especialidad — reporte fijo (Cuerpo de Profesionales
// Hospitalarios, sin jefes, Universo x Especialidad), calca la solapa
// homónima del Excel de presupuesto. Sin filtros de usuario por ahora.
// Todas las columnas salvo "actual" son valores históricos fijos (copiados
// del Excel) — ver EVOLUTIVO_ESPECIALIDAD_HISTORICO en el backend.
export interface EvolutivoEspecialidadFila {
  especialidad: string
  dic2023: number
  ene2025: number
  jun2025: number
  ene2026: number
  actual: number
  crecimiento: number
  concurso: number
  activosConcursos: number
}

export interface EvolutivoEspecialidadUniverso {
  universo: string
  label: string
  filas: EvolutivoEspecialidadFila[]
  subtotal: EvolutivoEspecialidadFila
}

export interface EvolutivoEspecialidadResponse {
  universos: EvolutivoEspecialidadUniverso[]
  total: EvolutivoEspecialidadFila
}

export function useEvolutivoEspecialidad() {
  return useQuery({
    queryKey: ['reporte-evolutivo-especialidad'],
    queryFn: async () => {
      const res = await apiClient.get<EvolutivoEspecialidadResponse>('/api/v1/reportes/evolutivo-especialidad')
      return res.data
    },
  })
}
