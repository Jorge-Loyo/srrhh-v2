import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoIncidencia = 'baja_gestionable' | 'puesto_nuevo_gestionable'
export type EstadoIncidencia = 'pendiente' | 'resuelta' | 'descartada'
export type TipoConcursoDim = 'cph' | 'ceetps'

export interface DimIncidencia {
  id: string
  tipo: TipoIncidencia
  estado: EstadoIncidencia
  sesionId: string
  idSialRol: string | null
  codigoRegistro: string
  efector: string
  literalPuesto: string
  especialidad: string | null
  cuil: string | null
  codigoCargo: string | null
  concursoId: string | null
  resolucion: string | null
  createdAt: string
  updatedAt: string
  efectorRel: { nombre: string | null }
  sesion: { fechaArchivo: string | null }
  concurso: { id: string; tipo: TipoConcursoDim; estado: string } | null
}

export interface DimIncidenciasResponse {
  rows: DimIncidencia[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface DimIncidenciasFilters {
  page: number
  limit: number
  tipo?: TipoIncidencia
  estado?: EstadoIncidencia
  efector?: string
  codigoRegistro?: string
}

export interface DimConcursoCph {
  id: string
  concursoId: string
  eeBaja: string | null
  fechaBaja: string | null
  eeConcurso: string | null
  fechaEeConcurso: string | null
  ifAutorizacion: string | null
  fechaAutorizacion: string | null
  tipoGestion: string | null
  subEstado: string | null
  subEstado3: string | null
}

export interface DimConcursoCeetps {
  id: string
  concursoId: string
  expedienteConcurso: string | null
  fechaCaratulacion: string | null
  ifAutorizacion: string | null
  fechaAutorizacion: string | null
  tipoGestion: string | null
  subEstado: string | null
}

export interface DimConcurso {
  id: string
  tipo: TipoConcursoDim
  motivoOrigen: string
  efector: string
  codigoRegistro: string
  literalPuesto: string
  especialidad: string | null
  codigoCargo: string | null
  estado: string
  observaciones: string | null
  sesionId: string | null
  createdAt: string
  updatedAt: string
  efectorRel: { nombre: string | null }
  cph: DimConcursoCph | null
  ceetps: DimConcursoCeetps | null
  incidencia: { id: string; tipo: TipoIncidencia } | null
}

export interface DimConcursosResponse {
  rows: DimConcurso[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface DimConcursosFilters {
  page: number
  limit: number
  tipo?: TipoConcursoDim
  estado?: string
  efector?: string
  codigoRegistro?: string
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const LABEL_TIPO_INCIDENCIA: Record<TipoIncidencia, string> = {
  baja_gestionable:         'Baja gestionable',
  puesto_nuevo_gestionable: 'Puesto nuevo gestionable',
}

export const LABEL_ESTADO_INCIDENCIA: Record<EstadoIncidencia, string> = {
  pendiente:  'Pendiente',
  resuelta:   'Resuelta',
  descartada: 'Descartada',
}

export const COLOR_ESTADO_INCIDENCIA: Record<EstadoIncidencia, string> = {
  pendiente:  'bg-yellow-100 text-yellow-800',
  resuelta:   'bg-green-100 text-green-800',
  descartada: 'bg-gray-100 text-gray-500',
}

export const LABEL_TIPO_CONCURSO: Record<TipoConcursoDim, string> = {
  cph:    'CPH',
  ceetps: 'CEETPS',
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useDimIncidencias(filters: DimIncidenciasFilters) {
  return useQuery({
    queryKey: ['dim-incidencias', filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page:  filters.page,
        limit: filters.limit,
      }
      if (filters.tipo)           params.tipo           = filters.tipo
      if (filters.estado)         params.estado         = filters.estado
      if (filters.efector)        params.efector        = filters.efector
      if (filters.codigoRegistro) params.codigoRegistro = filters.codigoRegistro

      const res = await apiClient.get<DimIncidenciasResponse>('/api/v1/dim-incidencias', { params })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export function useIniciarConcurso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, observaciones }: { id: string; observaciones?: string }) => {
      const res = await apiClient.post<{ data: DimConcurso }>(
        `/api/v1/dim-incidencias/${id}/iniciar-concurso`,
        { observaciones },
      )
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dim-incidencias'] })
      qc.invalidateQueries({ queryKey: ['dim-concursos'] })
    },
  })
}

export function useDescartarIncidencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const res = await apiClient.post<{ data: DimIncidencia }>(
        `/api/v1/dim-incidencias/${id}/descartar`,
        { motivo },
      )
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dim-incidencias'] }),
  })
}

export interface DimIncidenciaContexto {
  inc: DimIncidencia
  puesto: {
    idSialRol: string
    literalPuesto: string | null
    especialidad: string | null
    codigoRegistro: string
    codRep: string | null
    descRep: string | null
    jcat: string | null
    docRespaldAlta: string | null
    hospitalSigla: string | null
    situacionRevista: string | null
    puestoDesde: string | null
    puestoHasta: string | null
    motivoBaja: string | null
    docRespBaja: string | null
    bajasExist: string | null
    padronExist: string | null
  } | null
  persona: {
    cuil: string
    idSial: string | null
    apellidoNombre: string | null
    sexo: string | null
    fechaNacimiento: string | null
    especialidad: string | null
    antiguedadDesde: string | null
    telefono: string | null
    mailPersonal: string | null
    mailLaboral: string | null
    domicilio: string | null
    localidad: string | null
    saludPrimerCargo: string | null
    activo: boolean
  } | null
  actividad: {
    id: number
    idSialRol: string
    cuil: string | null
    situacionRevista: string | null
    fechaDesde: string
    fechaHasta: string | null
    esActual: boolean | null
    codigoCargo: string | null
  }[]
  arbol: {
    sigla: string | null
    descRep: string | null
    tipo: string | null
    universoTotalizador: string | null
    regimenEmpleo: string | null
    pathNombres: string | null
    lvl: number | null
  } | null
  pou: {
    sigla: string
    perfil: string | null
    especialidad: string | null
    dotacionTotal: number | null
    activos: number | null
    vacantes: number | null
  } | null
  cargo: {
    codigoCargo: string
    codigoRegistro: string
    efector: string | null
    estado: string
    subEstado: string | null
    literalPuestoLegacy: string | null
    especialidadLegacy: string | null
  } | null
  diffs: {
    id: string
    tablaAfectada: string
    tipoDiff: string
    clave: string
    campo: string | null
    valorAnterior: string | null
    valorNuevo: string | null
  }[]
}

export function useDimIncidenciaContexto(id: string | null) {
  return useQuery({
    queryKey: ['dim-incidencia-contexto', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiClient.get<{ data: DimIncidenciaContexto }>(
        `/api/v1/dim-incidencias/${id}/contexto`,
      )
      return res.data.data
    },
  })
}

export function useDimConcursos(filters: DimConcursosFilters) {
  return useQuery({
    queryKey: ['dim-concursos', filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page:  filters.page,
        limit: filters.limit,
      }
      if (filters.tipo)           params.tipo           = filters.tipo
      if (filters.estado)         params.estado         = filters.estado
      if (filters.efector)        params.efector        = filters.efector
      if (filters.codigoRegistro) params.codigoRegistro = filters.codigoRegistro

      const res = await apiClient.get<DimConcursosResponse>('/api/v1/dim-incidencias/concursos', { params })
      return res.data
    },
    placeholderData: (prev) => prev,
  })
}

export function useDimConcursoDetalle(id: string | null) {
  return useQuery({
    queryKey: ['dim-concurso-detalle', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiClient.get<{ data: DimConcurso }>(`/api/v1/dim-incidencias/concursos/${id}`)
      return res.data.data
    },
  })
}
