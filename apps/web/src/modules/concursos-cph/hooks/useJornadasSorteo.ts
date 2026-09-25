import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CandidatoSorteo,
  CrearJornadaRequest,
  JornadaSorteoDetalle,
  JornadaSorteoResumen,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// GET /api/v1/jornadas-sorteo — listado de jornadas.
export function useJornadasSorteo() {
  return useQuery({
    queryKey: ['jornadas-sorteo'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: JornadaSorteoResumen[] }>('/api/v1/jornadas-sorteo')
      return res.data.data
    },
  })
}

// GET /api/v1/jornadas-sorteo/:id — detalle de una jornada.
export function useJornadaSorteo(id: string | undefined) {
  return useQuery({
    queryKey: ['jornadas-sorteo', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: JornadaSorteoDetalle }>(`/api/v1/jornadas-sorteo/${id}`)
      return res.data.data
    },
    enabled: Boolean(id),
  })
}

// GET /api/v1/jornadas-sorteo/candidatos — concursos en B-SORTEO JUR (por etiqueta opcional).
export function useCandidatosSorteo(etiquetaId?: string) {
  return useQuery({
    queryKey: ['jornadas-sorteo', 'candidatos', etiquetaId ?? null],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CandidatoSorteo[] }>(
        '/api/v1/jornadas-sorteo/candidatos',
        { params: etiquetaId ? { etiquetaId } : {} }
      )
      return res.data.data
    },
  })
}

// POST /api/v1/jornadas-sorteo — crear jornada.
export function useCrearJornadaSorteo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CrearJornadaRequest) => {
      const res = await apiClient.post<{ data: JornadaSorteoDetalle }>('/api/v1/jornadas-sorteo', body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jornadas-sorteo'] })
    },
  })
}

// PATCH /api/v1/jornadas-sorteo/:id/estado — cerrar / reabrir jornada.
export function useCambiarEstadoJornada() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: 'planificada' | 'finalizada' }) => {
      const res = await apiClient.patch<{ data: JornadaSorteoDetalle }>(
        `/api/v1/jornadas-sorteo/${id}/estado`,
        { estado }
      )
      return res.data.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jornadas-sorteo'] })
      queryClient.invalidateQueries({ queryKey: ['jornadas-sorteo', data.id] })
    },
  })
}
