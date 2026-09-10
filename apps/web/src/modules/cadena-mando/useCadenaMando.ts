import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface NodoCadena {
  nivel: number
  codigoReparticion: string
  descRep: string | null
  tipo: string
  conductor: string | null
  cargoLiteral: string | null
  codigoCargo: string | null
}

async function fetchCadenaMando(params: { personaId?: string; codigoRepa?: string }) {
  const res = await apiClient.get<{ data: NodoCadena[] }>('/api/v1/cadena-mando', {
    params: params.personaId ? { personaId: params.personaId } : { codigoRepa: params.codigoRepa },
  })
  return res.data.data
}

export function useCadenaMando(params: { personaId?: string; codigoRepa?: string }, enabled = true) {
  return useQuery({
    queryKey: ['cadena-mando', params],
    queryFn: () => fetchCadenaMando(params),
    enabled: enabled && !!(params.personaId || params.codigoRepa),
  })
}
