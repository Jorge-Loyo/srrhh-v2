import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

// S17-6: tipo de GET /api/v1/bajas/vinculacion (S17-5). No está en
// @srrhh/types porque esos campos (padronVinculadoAt/snapshotVinculadoId)
// no se agregaron ahí en S17-1 — solo lo consume esta vista.
export interface BajaVinculacion {
  id: string
  cargoId: string
  cargoCodigo: string | null
  hospitalNombre: string
  personaApellidoNombre: string | null
  fechaBaja: string
  estado: 'confirmada' | 'pendiente' | 'anulada'
  generaConcurso: boolean
  concursoId: string | null
  padronVinculadoAt: string | null
  snapshotVinculado: { id: string; filename: string; fechaArchivo: string } | null
}

export function useBajaVinculacion(params: { search?: string; vinculacion?: 'todas' | 'vinculadas' | 'sin_vincular' } = {}) {
  return useQuery({
    queryKey: ['bajas', 'vinculacion', params],
    queryFn: async () => {
      const res = await apiClient.get<{ data: BajaVinculacion[] }>('/api/v1/bajas/vinculacion', { params })
      return res.data.data
    },
  })
}

export function diasSinVincular(fechaBaja: string): number {
  const ms = Date.now() - new Date(fechaBaja).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function diasSinVincularBadgeClass(dias: number): string {
  if (dias >= 60) return 'badge-danger'
  if (dias >= 30) return 'badge-warning'
  return 'badge-default'
}
