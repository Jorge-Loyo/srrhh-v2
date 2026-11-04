import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

// ─── Tipos del contrato con el backend (incidencias.service.ts) ──────────────
// La cola de pendientes deriva de los PadronDiff tipo='nuevo' aprobado=null de
// snapshots aprobados. El backend ya aplana el valorNuevo y agrega diagnóstico
// (con/sin concurso) y el flag tieneBajaAsociada por fila.

export interface PendienteValorNuevo {
  idSial: string | null
  cuil: string | null
  ayn: string | null
  siglas: string | null
  escalafon: string | null
  literalPuesto: string | null
  codigoDeRegistro: string | null
  especialidad: string | null
}

export interface PendienteDiagnostico {
  clasificacion: string
  concursoCphId: string | null
  concursoCodigo: string | null
}

export interface PendienteItem {
  diffId: string
  snapshotId: string
  idSialRol: string
  fechaAsignada: string
  valorNuevo: PendienteValorNuevo
  diagnostico: PendienteDiagnostico | null
  tieneBajaAsociada: boolean
}

export interface PendientesResumen {
  total: number
  conConcurso: number
  sinConcurso: number
  conBajaAsociada: number
}

export interface PendientesResponse {
  pendientes: PendienteItem[]
  resumen: PendientesResumen
}

// Concurso candidato para vincular (mismo shape que buscarConcursosParaDiffService).
export interface ConcursoCandidato {
  id: string
  estado: string
  estaCompleto: boolean
  yaDesignado: boolean
  eeConcurso: string | null
  expediente: string | null
  codigoCargo: string | null
  literalPuesto: string | null
  especialidad: string | null
  hospital: string | null
}

const PENDIENTES_KEY = ['incidencias', 'pendientes'] as const

export function useIncidenciasPendientes() {
  return useQuery({
    queryKey: PENDIENTES_KEY,
    queryFn: async () => {
      const res = await apiClient.get<{ data: PendientesResponse }>(
        '/api/v1/incidencias/pendientes',
      )
      return res.data.data
    },
  })
}

// Invalida la cola tras gestionar un id_sial — compartido por todas las mutaciones.
// Además invalida resumen/todo/baja-sin-concurso para que contadores y listas de
// las otras pestañas se refresquen sin acoplar componentes.
function useInvalidarPendientes() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PENDIENTES_KEY }),
      queryClient.invalidateQueries({ queryKey: ['incidencias', 'resumen'] }),
      queryClient.invalidateQueries({ queryKey: ['incidencias', 'todo'] }),
      queryClient.invalidateQueries({ queryKey: ['incidencias', 'baja-sin-concurso'] }),
    ])
}

export function useCrearCargo() {
  const invalidar = useInvalidarPendientes()
  return useMutation({
    mutationFn: async (diffId: string) => {
      const res = await apiClient.post(`/api/v1/incidencias/pendientes/${diffId}/crear-cargo`)
      return res.data.data
    },
    onSuccess: invalidar,
  })
}

export function useVincularConcurso() {
  const invalidar = useInvalidarPendientes()
  return useMutation({
    mutationFn: async ({ diffId, concursoCphId }: { diffId: string; concursoCphId: string }) => {
      const res = await apiClient.post(
        `/api/v1/incidencias/pendientes/${diffId}/vincular-concurso`,
        { concursoCphId },
      )
      return res.data.data
    },
    onSuccess: invalidar,
  })
}

export function useTransferencia() {
  const invalidar = useInvalidarPendientes()
  return useMutation({
    mutationFn: async (diffId: string) => {
      const res = await apiClient.post(`/api/v1/incidencias/pendientes/${diffId}/transferencia`)
      return res.data.data
    },
    onSuccess: invalidar,
  })
}

// Cuerpo del concurso a crear para un id_sial (cargoId/hospitalId los resuelve
// el backend desde el diff; el usuario aporta el resto).
export interface CrearConcursoBody {
  origen: string
  fechaVacante: string
  tipoConcurso: string
  motivo?: string
  expediente?: string
  especialidadSolicitada?: string
}

export function useCrearConcurso() {
  const invalidar = useInvalidarPendientes()
  return useMutation({
    mutationFn: async ({ diffId, body }: { diffId: string; body: CrearConcursoBody }) => {
      const res = await apiClient.post(
        `/api/v1/incidencias/pendientes/${diffId}/crear-concurso`,
        body,
      )
      return res.data.data
    },
    onSuccess: invalidar,
  })
}

export function useSinCodigo() {
  const invalidar = useInvalidarPendientes()
  return useMutation({
    mutationFn: async (diffId: string) => {
      const res = await apiClient.post(`/api/v1/incidencias/pendientes/${diffId}/sin-codigo`)
      return res.data.data
    },
    onSuccess: invalidar,
  })
}

// Buscar concursos CPH candidatos a vincular con un id_sial pendiente. Devuelve
// la función de fetch directa (se usa con debounce desde el modal, igual que el
// padrón) en vez de un useQuery por tecla.
export async function buscarConcursosParaPendiente(diffId: string, q?: string) {
  const params = q ? `?q=${encodeURIComponent(q)}` : ''
  const res = await apiClient.get<{ data: ConcursoCandidato[] }>(
    `/api/v1/incidencias/pendientes/${diffId}/concursos${params}`,
  )
  return res.data.data ?? []
}

// ─── Pestañas "Todo" / "Baja sin concurso" / contadores (solo lectura) ───────
// Contrato: apps/api/src/modules/incidencias (rutas /resumen, /todo, /baja-sin-concurso).
export type TipoIncidenciaSlug = 'sial-sin-cargo' | 'baja-sin-concurso'

export interface ContextoIncidencias {
  ultimoPadron: {
    fechaAsignada: string
    totalRegistros: number
    ratioTamano: number | null
    advertenciaTamano: string | null
  } | null
  ultimaBajaSial: { fechaArchivo: string; estado: 'pendiente' | 'aprobado' } | null
}

export interface ConciliacionIncidencias {
  totalCargos: number
  dotacion: number
  grupos: {
    no_vigente: number
    ocupado: number
    en_concurso: number
    alta_pendiente: number
    baja_sin_concurso: number
    sin_clasificar: number
  }
  sumaGrupos: number
  porOrigenBaja: { baja_sial: number; padron: number }
}

export interface ResumenIncidencias {
  tabs: Record<TipoIncidenciaSlug | 'todo', number>
  conciliacion: ConciliacionIncidencias
  contexto: ContextoIncidencias
  generadoAt: string
}

export interface Paginacion {
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface BajaSinConcursoItem {
  cargoId: string
  codigo: string | null
  idSial: string | null
  hospitalSigla: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  persona: { cuil: string | null; nombre: string | null } | null
  estadoCargo: 'vigente' | 'validacion_vacante'
  subEstado: 'ocupado' | 'vacante' | 'concurso' | null
  estadoDesde: string | null
  deteccion: {
    origen: 'baja_sial' | 'padron'
    texto: string
    fechaDeteccion: string | null
    fechaBaja: string | null
    fechaPadron: string | null
    fuenteFechaPadron: string
    enBajaSial: boolean
    ausentePadron: boolean
    motBaja: string | null
    docRespBaja: string | null
  }
  diasSinCubrir: number | null
  bajaFormal: {
    estado: 'resolucion_a_la_firma' | 'pendiente' | 'confirmada' | 'anulada'
    generaConcurso: boolean
  } | null
  tuvoConcursoCerrado: boolean
}

export interface BajaSinConcursoResponse {
  items: BajaSinConcursoItem[]
  meta: Paginacion
  generadoAt: string
  porOrigen: { baja_sial: number; padron: number }
  contexto: ContextoIncidencias
}

export interface IncidenciaTodoItem {
  clave: string
  tipo: TipoIncidenciaSlug
  tipoLabel: string
  idSial: string | null
  codigo: string | null
  hospitalSigla: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  personaCuil: string | null
  personaNombre: string | null
  fecha: string | null
  detalle: string
  cargoId: string | null
  diffId: string | null
}

export interface TodoResponse {
  items: IncidenciaTodoItem[]
  meta: Paginacion
  generadoAt: string
  porTipo: Record<TipoIncidenciaSlug, number>
}

export function useIncidenciasResumen(enabled: boolean) {
  return useQuery({
    queryKey: ['incidencias', 'resumen'],
    enabled,
    queryFn: async () => {
      const res = await apiClient.get<{ data: ResumenIncidencias }>('/api/v1/incidencias/resumen')
      return res.data.data
    },
  })
}

export interface BajaSinConcursoParams {
  page: number
  pageSize: number
  q?: string
  carrera?: string
  origen?: 'baja_sial' | 'padron'
  estadoCargo?: 'vigente' | 'validacion_vacante'
}

// Descarta params vacíos para no enviar `q=` ni `carrera=`.
function limpiarParams<T extends object>(p: T): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined && v !== ''),
  ) as Record<string, string | number>
}

export function useBajaSinConcurso(params: BajaSinConcursoParams) {
  return useQuery({
    queryKey: ['incidencias', 'baja-sin-concurso', params],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await apiClient.get<{ data: BajaSinConcursoResponse }>(
        '/api/v1/incidencias/baja-sin-concurso',
        { params: limpiarParams(params) },
      )
      return res.data.data
    },
  })
}

export interface TodoParams {
  page: number
  pageSize: number
  q?: string
  carrera?: string
  tipo?: TipoIncidenciaSlug
}

export function useTodoIncidencias(params: TodoParams) {
  return useQuery({
    queryKey: ['incidencias', 'todo', params],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await apiClient.get<{ data: TodoResponse }>('/api/v1/incidencias/todo', {
        params: limpiarParams(params),
      })
      return res.data.data
    },
  })
}

// Botón "Actualizar": fuerza la recarga de la caché del servidor (refrescar=true
// en /resumen) y luego refresca resumen y listas de las pestañas de monitoreo.
export function useActualizarIncidencias() {
  const queryClient = useQueryClient()
  return async () => {
    const res = await apiClient.get<{ data: ResumenIncidencias }>('/api/v1/incidencias/resumen', {
      params: { refrescar: 'true' },
    })
    queryClient.setQueryData(['incidencias', 'resumen'], res.data.data)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['incidencias', 'todo'] }),
      queryClient.invalidateQueries({ queryKey: ['incidencias', 'baja-sin-concurso'] }),
      queryClient.invalidateQueries({ queryKey: ['incidencias', 'pendientes'] }),
    ])
  }
}
