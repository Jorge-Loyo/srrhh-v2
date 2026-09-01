import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface BajaSialSnapshot {
  id: string
  filename: string
  fecha_archivo: string
  total_registros: number
  nuevas: number
  salidas: number
  modificadas: number
  estado: 'procesando' | 'pendiente' | 'aprobado' | 'rechazado' | 'error'
  error_msg: string | null
  created_at: string
  aprobado_at: string | null
}

export interface BajaSialDiff {
  id: string
  tipo: 'nuevo' | 'modificado' | 'eliminado'
  cargo: string
  cuil: string
  ayn: string
  escalafon: string | null
  lit_puesto: string | null
  mot_baja: string | null
  cargo_hasta: string | null
  existe_en_personas: boolean
  tiene_ocup_activa: boolean
  campo: string | null
  valor_anterior: string | null
  valor_nuevo: string | null
}

export interface BajaSialRegistro {
  cargo: string
  cuil: string
  ayn: string
  escalafon: string | null
  lit_puesto: string | null
  mot_baja: string | null
  cargo_desde: string | null
  cargo_hasta: string | null
  doc_resp_baja: string | null
  desc_rep: string | null
  lit_agrup: string | null
}

// ── Snapshots ────────────────────────────────────────────────────────────────

export function useBajasSialSnapshots() {
  return useQuery({
    queryKey: ['bajas-sial', 'snapshots'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: BajaSialSnapshot[] }>('/api/v1/bajas-sial/snapshots')
      return res.data.data
    },
    refetchInterval: 30_000,
  })
}

export function useBajasSialEstado(snapshotId: string | null) {
  return useQuery({
    queryKey: ['bajas-sial', 'snapshots', snapshotId, 'estado'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: BajaSialSnapshot }>(`/api/v1/bajas-sial/snapshots/${snapshotId}/estado`)
      return res.data.data
    },
    enabled: !!snapshotId,
    refetchInterval: (query) => (query.state.data?.estado === 'procesando' ? 2_000 : false),
  })
}

export function useBajasSialDiff(
  snapshotId: string | undefined,
  params: { page?: number; limit?: number; tipo?: string } = {}
) {
  return useQuery({
    queryKey: ['bajas-sial', 'snapshots', snapshotId, 'diff', params],
    queryFn: async () => {
      const res = await apiClient.get<{ data: {
        snapshot: BajaSialSnapshot
        summary: { nuevas: number; salidas: number; modificadas: number }
        diffs: { data: BajaSialDiff[]; meta: { total: number; page: number; limit: number; pages: number } }
      } }>(`/api/v1/bajas-sial/snapshots/${snapshotId}/diff`, { params })
      return res.data.data
    },
    enabled: !!snapshotId,
  })
}

// ── Upload ───────────────────────────────────────────────────────────────────

export function useUploadBajasSial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, fechaArchivo }: { file: File; fechaArchivo: string }) => {
      const form = new FormData()
      form.append('fechaArchivo', fechaArchivo)
      form.append('file', file)
      const res = await apiClient.post<{ data: { snapshotId: string; totalRegistros: number } }>(
        '/api/v1/bajas-sial/upload', form
      )
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bajas-sial', 'snapshots'] }),
  })
}

// ── Aprobar / Rechazar ───────────────────────────────────────────────────────

export function useAprobarBajasSial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiClient.post(`/api/v1/bajas-sial/snapshots/${snapshotId}/aprobar`)
      return res.data.data
    },
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ['bajas-sial', 'snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['bajas-sial', 'snapshots', id] })
      queryClient.invalidateQueries({ queryKey: ['bajas-sial', 'registros'] })
    },
  })
}

export function useRechazarBajasSial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiClient.post(`/api/v1/bajas-sial/snapshots/${snapshotId}/rechazar`)
      return res.data.data
    },
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ['bajas-sial', 'snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['bajas-sial', 'snapshots', id] })
    },
  })
}

// ── Registros del último aprobado (para /bajas) ──────────────────────────────

export function useBajasSialRegistros(params: { page?: number; limit?: number; search?: string; motivo?: string } = {}) {
  return useQuery({
    queryKey: ['bajas-sial', 'registros', params],
    queryFn: async () => {
      const res = await apiClient.get<{ data: {
        data: BajaSialRegistro[]
        meta: { total: number; page: number; limit: number; pages: number }
      } }>('/api/v1/bajas-sial/registros', { params })
      return res.data.data
    },
  })
}
