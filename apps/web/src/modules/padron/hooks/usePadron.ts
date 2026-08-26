import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EstadoSnapshot } from '@srrhh/types'
import type {
  PadronSnapshot,
  SnapshotDiffResponse,
  SnapshotEstadoResponse,
  TipoDiff,
  UploadPadronResponse,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

export function useSnapshots() {
  return useQuery({
    queryKey: ['padron', 'snapshots'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PadronSnapshot[] }>('/api/v1/padron/snapshots')
      return res.data.data
    },
    // Refresco periódico: esto alimenta el badge de "snapshot pendiente" en el
    // header (S2-11), tiene que reflejar sin recargar si Jorge/otro admin
    // aprueba o rechaza desde otra sesión.
    refetchInterval: 60_000,
  })
}

export function useSnapshotDiff(
  snapshotId: string | undefined,
  params: { page?: number; limit?: number; tipo?: TipoDiff } = {}
) {
  return useQuery({
    queryKey: ['padron', 'snapshots', snapshotId, 'diff', params],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SnapshotDiffResponse }>(
        `/api/v1/padron/snapshots/${snapshotId}/diff`,
        { params }
      )
      return res.data.data
    },
    enabled: !!snapshotId,
  })
}

// S2-9: subir el Excel. uploadPadronService hace la parte sincrónica (leer el
// archivo, contar filas) y devuelve enseguida — el resto del pipeline
// (normalizar/procesar/cruzar/diff) corre en background, se seguía con
// useSnapshotEstado.
export function useUploadPadron() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, fechaAsignada }: { file: File; fechaAsignada: string }) => {
      const form = new FormData()
      form.append('fechaAsignada', fechaAsignada)
      form.append('file', file)
      const res = await apiClient.post<{ data: UploadPadronResponse }>('/api/v1/padron/upload', form)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['padron', 'snapshots'] })
    },
  })
}

// S2-18: polling de GET /snapshots/:id/estado mientras el pipeline corre en
// background. Se corta solo cuando el snapshot sale de "procesando" (no hace
// falta que el componente se acuerde de desactivarlo a mano).
export function useSnapshotEstado(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ['padron', 'snapshots', snapshotId, 'estado'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: SnapshotEstadoResponse }>(
        `/api/v1/padron/snapshots/${snapshotId}/estado`
      )
      return res.data.data
    },
    enabled: !!snapshotId,
    refetchInterval: (query) => (query.state.data?.estado === EstadoSnapshot.PROCESANDO ? 2_000 : false),
  })
}

export function useAprobarSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/aprobar`)
      return res.data.data
    },
    onSuccess: (_data, snapshotId) => {
      queryClient.invalidateQueries({ queryKey: ['padron', 'snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['padron', 'snapshots', snapshotId] })
    },
  })
}

export function useRechazarSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiClient.post(`/api/v1/padron/snapshots/${snapshotId}/rechazar`)
      return res.data.data
    },
    onSuccess: (_data, snapshotId) => {
      queryClient.invalidateQueries({ queryKey: ['padron', 'snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['padron', 'snapshots', snapshotId] })
    },
  })
}
