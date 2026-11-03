import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Etiqueta, CrearEtiquetaRequest } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// Catálogo de etiquetas reutilizables, generalizado a cualquier entidad que el
// backend soporte. El backend expone CRUD + asignar/desasignar en
// /api/v1/etiquetas; acá cubrimos lo que necesita la UI: listar, crear, y
// asignar/quitar sobre una entidad arbitraria (cargo, concurso_cph, etc.).

// Entidades a las que se pueden asignar etiquetas (espeja el enum del backend
// en etiquetas.schema.ts).
export type EntidadEtiqueta = 'cargo' | 'concurso_cph' | 'baja' | 'solicitud_alta'

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

// Invalida el catálogo de etiquetas más las vistas que muestran etiquetas de la
// entidad afectada, para que las etiquetas asignadas se refresquen. Para
// 'concurso_cph' invalida las queries de concursos (lista + detalle del wizard);
// para 'cargo' invalida las queries de cargos (lista, detalle y modales).
function invalidarPorEntidad(
  queryClient: ReturnType<typeof useQueryClient>,
  entidad: EntidadEtiqueta,
) {
  queryClient.invalidateQueries({ queryKey: ['etiquetas'], exact: false })
  switch (entidad) {
    case 'concurso_cph':
      queryClient.invalidateQueries({ queryKey: ['concursos-cph'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['concurso-cph-wizard'], exact: false })
      break
    case 'cargo':
      queryClient.invalidateQueries({ queryKey: ['cargos'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cargo'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cargo-detalle'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['cargo-modal-baja'], exact: false })
      break
    case 'baja':
      queryClient.invalidateQueries({ queryKey: ['bajas'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['baja-editar'], exact: false })
      break
    case 'solicitud_alta':
      queryClient.invalidateQueries({ queryKey: ['solicitudes-alta'], exact: false })
      break
  }
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

// POST /api/v1/etiquetas/:id/asignar — asigna una etiqueta a una entidad.
export function useAsignarEtiqueta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      etiquetaId,
      entidad,
      entidadId,
    }: {
      etiquetaId: string
      entidad: EntidadEtiqueta
      entidadId: string
    }) => {
      await apiClient.post(`/api/v1/etiquetas/${etiquetaId}/asignar`, {
        entidad,
        entidadId,
      })
    },
    onSuccess: (_data, variables) => invalidarPorEntidad(queryClient, variables.entidad),
  })
}

// DELETE /api/v1/etiquetas/:id/desasignar — quita una etiqueta de una entidad.
export function useDesasignarEtiqueta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      etiquetaId,
      entidad,
      entidadId,
    }: {
      etiquetaId: string
      entidad: EntidadEtiqueta
      entidadId: string
    }) => {
      await apiClient.delete(`/api/v1/etiquetas/${etiquetaId}/desasignar`, {
        data: { entidad, entidadId },
      })
    },
    onSuccess: (_data, variables) => invalidarPorEntidad(queryClient, variables.entidad),
  })
}
