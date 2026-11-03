import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

// ─── Tipos del contrato con el backend (gestion-puestos.service.ts) ──────────
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

const PENDIENTES_KEY = ['gestion-puestos', 'pendientes'] as const

export function useGestionPuestosPendientes() {
  return useQuery({
    queryKey: PENDIENTES_KEY,
    queryFn: async () => {
      const res = await apiClient.get<{ data: PendientesResponse }>(
        '/api/v1/gestion-puestos/pendientes',
      )
      return res.data.data
    },
  })
}

// Invalida la cola tras gestionar un id_sial — compartido por todas las mutaciones.
function useInvalidarPendientes() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: PENDIENTES_KEY })
}

export function useCrearCargo() {
  const invalidar = useInvalidarPendientes()
  return useMutation({
    mutationFn: async (diffId: string) => {
      const res = await apiClient.post(`/api/v1/gestion-puestos/pendientes/${diffId}/crear-cargo`)
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
        `/api/v1/gestion-puestos/pendientes/${diffId}/vincular-concurso`,
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
      const res = await apiClient.post(`/api/v1/gestion-puestos/pendientes/${diffId}/transferencia`)
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
        `/api/v1/gestion-puestos/pendientes/${diffId}/crear-concurso`,
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
      const res = await apiClient.post(`/api/v1/gestion-puestos/pendientes/${diffId}/sin-codigo`)
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
    `/api/v1/gestion-puestos/pendientes/${diffId}/concursos${params}`,
  )
  return res.data.data ?? []
}
