import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { EstadoTareaPendiente, PaginatedResponse, TareaPendiente } from '@srrhh/types'

export interface TareasFilters {
  page?: number
  limit?: number
  estado?: EstadoTareaPendiente
  tipo?: string
}

export interface TarjetaKanban {
  id: string
  tipo: 'cph' | 'ceetps'
  estado: string
  subEstado: string | null
  pendienteAutorizacion: boolean
  cargo: { id: string; codigo: string | null; literalPuesto: string | null }
  hospital: { id: string; sigla: string }
  diasSinMovimiento: number
  colorBadge: 'verde' | 'naranja' | 'rojo'
}

export interface KanbanSgrasvColumna {
  usuario: { id: string; nombre: string | null; apellido: string | null; username: string; rolSlug: string }
  siglas: { id: string; sigla: string; nombre: string }[]
  concursos: TarjetaKanban[]
}

export interface KanbanSgrasvData {
  sinAsignar: TarjetaKanban[]
  columnas: KanbanSgrasvColumna[]
}

export interface KanbanSupervisorData {
  novedadesDias: number
  columnas: {
    no_iniciado: TarjetaKanban[]
    pendiente_autorizacion: TarjetaKanban[]
    en_proceso: TarjetaKanban[]
    finalizado: TarjetaKanban[]
    novedades: TarjetaKanban[]
  }
}

// ── Contador de pendientes (badge del header) ───────────────────────────────
// SIN gate de permiso — las tareas son de acción personal (propias + las de
// usuarios bajo el rol del logueado), así que siempre pollea.
export function useTareasPendientes(enabled = true) {
  return useQuery({
    queryKey: ['tareas', 'pendientes'],
    queryFn: async () => {
      const res = await apiClient.get<{ count: number }>('/api/v1/tareas/pendientes')
      return res.data.count
    },
    enabled,
    refetchInterval: 60_000,
  })
}

// ── Listado paginado — tareas visibles para el usuario logueado ─────────────
export function useTareas(filters: TareasFilters = {}) {
  return useQuery({
    queryKey: ['tareas', 'lista', filters],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<TareaPendiente>>('/api/v1/tareas', {
        params: filters,
      })
      return res.data
    },
  })
}

// ── Marcar una tarea como resuelta ───────────────────────────────────────────
export function useResolverTarea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Body vacío a propósito: el backend exige Content-Type application/json
      // (requireJsonContentType); con `{}` axios lo setea. El endpoint no usa payload.
      const res = await apiClient.post<{ data: TareaPendiente }>(`/api/v1/tareas/${id}/resolver`, {})
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas'] })
    },
  })
}

// ── Kanban SGRASV ──────────────────────────────────────────────────────────
export function useKanbanSgrasv() {
  return useQuery({
    queryKey: ['tareas', 'kanban-sgrasv'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KanbanSgrasvData }>('/api/v1/tareas/kanban-sgrasv')
      return res.data.data
    },
  })
}

// ── Kanban supervisor ──────────────────────────────────────────────────────
export function useKanbanSupervisor(novedadesDias: number) {
  return useQuery({
    queryKey: ['tareas', 'kanban-supervisor', novedadesDias],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KanbanSupervisorData }>('/api/v1/tareas/kanban-supervisor', {
        params: { novedadesDias },
      })
      return res.data.data
    },
  })
}

// ── Asignar / liberar un concurso ──────────────────────────────────────────
export function useAsignarConcurso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      referenciaId: string
      referenciaTipo: 'concurso_cph' | 'concurso_ceetps'
      usuarioId: string | null
    }) => {
      const res = await apiClient.post('/api/v1/tareas/asignar', body)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas', 'kanban-sgrasv'] }),
  })
}
