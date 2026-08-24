import { useQuery } from '@tanstack/react-query'
import type { PadronSnapshot, SnapshotDiffResponse, TipoDiff } from '@srrhh/types'
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
