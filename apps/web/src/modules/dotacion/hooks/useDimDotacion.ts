import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DimDotacionRow {
  id: number
  idSialRol: string
  cuil: string | null
  situacionRevista: string | null
  fechaDesde: string
  codigoCargo: string | null
  // Puesto
  literalPuesto: string | null
  especialidad: string | null
  codigoRegistro: string | null
  efector: string | null
  codRep: string | null
  descRep: string | null
  situacionRevistaPuesto: string | null
  // Carrera
  litCodReg: string | null
  escalafon: string | null
  // Persona
  apellidoNombre: string | null
  sexo: string | null
  mailLaboral: string | null
  telefono: string | null
  fechaNacimiento: string | null
  // Efector
  efectorNombre: string | null
}

export interface DimDotacionListResponse {
  rows: DimDotacionRow[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface DimDotacionFilters {
  page: number
  limit: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  efector?: string[]
  codigoRegistro?: string[]
  situacionRevista?: string[]
  literalPuesto?: string[]
  especialidad?: string[]
  idSialRol?: string
  cuil?: string
  apellidoNombre?: string
}

export interface DimDotacionKpis {
  totalActivos: number
  personasUnicas: number
  porSituacionRevista: { situacion: string; total: number }[]
  porCarrera: { codigoRegistro: string; litCodReg: string; total: number }[]
  porEfector: { efector: string; nombre: string; total: number }[]
}

export interface DimActividadDetalle {
  id: number
  idSialRol: string
  cuil: string | null
  situacionRevista: string | null
  fechaDesde: string
  fechaHasta: string | null
  esActual: boolean | null
  codigoCargo: string | null
  literalPuesto: string | null
  especialidad: string | null
  codigoRegistro: string | null
  efector: string | null
  codRep: string | null
  descRep: string | null
  jcat: string | null
  situacionRevistaPuesto: string | null
  puestoDesde: string | null
  puestoHasta: string | null
  litCodReg: string | null
  escalafon: string | null
  apellidoNombre: string | null
  sexo: string | null
  mailLaboral: string | null
  telefono: string | null
  fechaNacimiento: string | null
  saludPrimerCargo: string | null
  efectorNombre: string | null
}

// ─── Serialización ───────────────────────────────────────────────────────────

function toDimParams(f: DimDotacionFilters): Record<string, string | number> {
  const p: Record<string, string | number> = { page: f.page, limit: f.limit }
  if (f.sortBy) p.sortBy = f.sortBy
  if (f.sortDir) p.sortDir = f.sortDir
  if (f.efector?.length) p.efector = f.efector.join(',')
  if (f.codigoRegistro?.length) p.codigoRegistro = f.codigoRegistro.join(',')
  if (f.situacionRevista?.length) p.situacionRevista = f.situacionRevista.join(',')
  if (f.literalPuesto?.length) p.literalPuesto = f.literalPuesto.join(',')
  if (f.especialidad?.length) p.especialidad = f.especialidad.join(',')
  if (f.idSialRol) p.idSialRol = f.idSialRol
  if (f.cuil) p.cuil = f.cuil
  if (f.apellidoNombre) p.apellidoNombre = f.apellidoNombre
  return p
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useDimDotacion(filters: DimDotacionFilters) {
  return useQuery({
    queryKey: ['dim-dotacion', filters],
    queryFn: async () => {
      const res = await apiClient.get<DimDotacionListResponse>('/api/v1/dim-dotacion', {
        params: toDimParams(filters),
      })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export function useDimDotacionKpis(efector?: string, codigoRegistro?: string) {
  return useQuery({
    queryKey: ['dim-dotacion-kpis', efector, codigoRegistro],
    queryFn: async () => {
      const res = await apiClient.get<DimDotacionKpis>('/api/v1/dim-dotacion/kpis', {
        params: {
          ...(efector ? { efector } : {}),
          ...(codigoRegistro ? { codigoRegistro } : {}),
        },
      })
      return res.data
    },
  })
}

export function useDimActividadDetalle(idSialRol: string | null) {
  return useQuery({
    queryKey: ['dim-actividad-detalle', idSialRol],
    queryFn: async () => {
      const res = await apiClient.get<DimActividadDetalle[]>(
        `/api/v1/dim-dotacion/actividad/${idSialRol}`,
      )
      return res.data
    },
    enabled: Boolean(idSialRol),
  })
}

// ─── Catálogos ───────────────────────────────────────────────────────────────

export interface DimEfector {
  sigla: string
  nombre: string | null
  nombreCompleto: string | null
  tipo: string | null
}

export interface DimCarrera {
  codigoRegistro: string
  litCodReg: string | null
  escalafon: string | null
}

export function useDimEfectores() {
  return useQuery({
    queryKey: ['dim-efectores'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DimEfector[] }>('/api/v1/dim-dotacion/efectores')
      return res.data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useDimCarreras() {
  return useQuery({
    queryKey: ['dim-carreras'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DimCarrera[] }>('/api/v1/dim-dotacion/carreras')
      return res.data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface DimPuestoCatalogo {
  literalPuesto: string | null
  especialidad: string | null
  codigoRegistro: string | null
}

export function useDimPuestos(efector?: string, codigoRegistro?: string) {
  return useQuery({
    queryKey: ['dim-puestos-catalogo', efector, codigoRegistro],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DimPuestoCatalogo[] }>('/api/v1/dim-dotacion/puestos', {
        params: {
          ...(efector ? { efector } : {}),
          ...(codigoRegistro ? { codigoRegistro } : {}),
        },
      })
      return res.data.data
    },
    staleTime: 2 * 60 * 1000,
  })
}
