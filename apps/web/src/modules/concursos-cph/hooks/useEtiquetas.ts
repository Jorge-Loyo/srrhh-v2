import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Etiqueta, CrearEtiquetaRequest } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// Catálogo de etiquetas reutilizables. El backend expone CRUD + asignar/
// desasignar en /api/v1/etiquetas; acá cubrimos lo que necesita la UI de
// concursos CPH: listar, crear, y asignar/quitar sobre un concurso.

// GET /api/v1/etiquetas — solo las activas por defecto.
export function useEtiquetas() {
  return useQuery({
    queryKey: ['etiquetas'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Etiqueta[] }>('/api/v1/etiquetas', {
        params: { activo: true },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

// Invalida las vistas que muestran etiquetas de concursos (lista, detalle y
// el detalle del wizard) además del catálogo de etiquetas.
function invalidarEtiquetasYConcursos(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['etiquetas'], exact: false })
  queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
  queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard'], exact: false })
}

// POST /api/v1/etiquetas — crea una etiqueta nueva y devuelve la creada.
export function useCrearEtiqueta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CrearEtiquetaRequest) => {
      const res = await apiClient.post<{ data: Etiqueta }>('/api/v1/etiquetas', body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etiquetas'], exact: false })
    },
  })
}

// POST /api/v1/etiquetas/:id/asignar — asigna una etiqueta a un concurso CPH.
export function useAsignarEtiqueta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      etiquetaId,
      concursoCphId,
    }: {
      etiquetaId: string
      concursoCphId: string
    }) => {
      await apiClient.post(`/api/v1/etiquetas/${etiquetaId}/asignar`, {
        entidad: 'concurso_cph',
        entidadId: concursoCphId,
      })
    },
    onSuccess: () => invalidarEtiquetasYConcursos(queryClient),
  })
}

// DELETE /api/v1/etiquetas/:id/desasignar — quita una etiqueta de un concurso.
export function useDesasignarEtiqueta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      etiquetaId,
      concursoCphId,
    }: {
      etiquetaId: string
      concursoCphId: string
    }) => {
      await apiClient.delete(`/api/v1/etiquetas/${etiquetaId}/desasignar`, {
        data: { entidad: 'concurso_cph', entidadId: concursoCphId },
      })
    },
    onSuccess: () => invalidarEtiquetasYConcursos(queryClient),
  })
}
