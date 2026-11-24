import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export type TipoCarga = 'cargos_salud' | 'bajas_salud' | 'arbol' | 'ocupacion_pou' | 'pou_decreto'
export type EstadoCarga = 'procesando' | 'pendiente_confirmacion' | 'completado' | 'error'

export interface CargaSesion {
  id: string
  tipo: TipoCarga
  estado: EstadoCarga
  fechaArchivo: string | null
  errorMsg: string | null
  informe: Record<string, unknown> | null
  usuarioId: string | null
  username: string | null
  createdAt: string
  finalizadoAt: string | null
  archivos: { id: string; filename: string; filas: number }[]
}

export const LABEL_TIPO: Record<TipoCarga, string> = {
  cargos_salud:  'Cargos Salud',
  bajas_salud:   'Bajas Salud',
  arbol:         'Árbol Organigrama',
  ocupacion_pou: 'Ocupación POU',
  pou_decreto:   'POU Decreto',
}

export const ICONO_TIPO: Record<TipoCarga, string> = {
  cargos_salud:  '👥',
  bajas_salud:   '📤',
  arbol:         '🌳',
  ocupacion_pou: '📊',
  pou_decreto:   '📜',
}

export const COLOR_ESTADO: Record<EstadoCarga, string> = {
  procesando:             'bg-yellow-100 text-yellow-800',
  pendiente_confirmacion: 'bg-blue-100 text-blue-800',
  completado:             'bg-green-100 text-green-800',
  error:                  'bg-red-100 text-red-800',
}

// Tablas afectadas por cada tipo de carga
export const TABLAS_POR_TIPO: Record<TipoCarga, string[]> = {
  cargos_salud:  ['dim_puestos', 'dim_personas', 'dim_actividad_hechos'],
  bajas_salud:   ['dim_puestos', 'dim_personas', 'dim_actividad_hechos'],
  arbol:         ['organigramas'],
  ocupacion_pou: ['pou'],
  pou_decreto:   [],
}

// Detecta el tipo de un archivo por su nombre (mismo patrón que el backend)
const PATRONES_TIPO: Array<{ patron: RegExp; tipo: TipoCarga }> = [
  { patron: /cargos[_\s-]*salud/i,  tipo: 'cargos_salud' },
  { patron: /bajas[_\s-]*salud/i,   tipo: 'bajas_salud' },
  { patron: /arbol[_\s-]*salud/i,   tipo: 'arbol' },
  { patron: /ocupacion[_\s-]*pou/i, tipo: 'ocupacion_pou' },
  { patron: /pou[_\s-]*decreto/i,   tipo: 'pou_decreto' },
  { patron: /decreto[_\s-]*315/i,   tipo: 'pou_decreto' },
  { patron: /historico.*pou/i,       tipo: 'pou_decreto' },
]

export function detectarTipoPorFilename(filename: string): TipoCarga | null {
  for (const { patron, tipo } of PATRONES_TIPO) {
    if (patron.test(filename)) return tipo
  }
  return null
}

export interface CargaDiff {
  id: string
  tablaAfectada: string
  tipoDiff: 'nuevo' | 'modificado' | 'eliminado'
  clave: string
  campo: string | null
  valorAnterior: string | null
  valorNuevo: string | null
}

export interface ResolucionesConfirmar {
  modificados?: Record<string, 'nuevo' | 'actual'>
  eliminados?: Record<string, 'eliminar' | 'mantener'>
}

export function useCargaSesiones(params?: { tipo?: TipoCarga; estado?: EstadoCarga }) {
  return useQuery({
    queryKey: ['carga-semanal', 'sesiones', params],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargaSesion[]; total: number }>(
        '/api/v1/carga-semanal/sesiones',
        { params },
      )
      return res.data
    },
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.data.some((s) => s.estado === 'procesando')) return 3000
      return false
    },
  })
}

export function useCargaDiffs(sesionId: string | null) {
  return useQuery({
    queryKey: ['carga-semanal', 'diffs', sesionId],
    enabled: !!sesionId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargaDiff[]; total: number }>(
        `/api/v1/carga-semanal/sesiones/${sesionId}/diffs`,
        { params: { limit: 2000 } },
      )
      return res.data
    },
  })
}

export function useCargaSesion(sesionId: string | null) {
  return useQuery({
    queryKey: ['carga-semanal', 'sesion', sesionId],
    enabled: !!sesionId,
    refetchInterval: (query) => {
      const estado = query.state.data?.data?.estado
      return estado === 'procesando' ? 2000 : false
    },
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargaSesion }>(
        `/api/v1/carga-semanal/sesiones/${sesionId}`,
      )
      return res.data
    },
  })
}

export function useConfirmarCarga() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sesionId,
      resoluciones,
    }: {
      sesionId: string
      resoluciones: ResolucionesConfirmar
    }) => {
      const res = await apiClient.post<{ data: { sesionId: string; mensaje: string } }>(
        `/api/v1/carga-semanal/sesiones/${sesionId}/confirmar`,
        { resoluciones },
      )
      return res.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['carga-semanal'] }),
  })
}

export function useDescartarCarga() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sesionId: string) => {
      await apiClient.delete(`/api/v1/carga-semanal/sesiones/${sesionId}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['carga-semanal'] }),
  })
}

export function useSubirCargaSemanal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData()
      for (const file of files) formData.append('file', file)
      const res = await apiClient.post<{ data: { sesionId: string; tipos: string[]; archivos: string[]; estado: string } }>(
        '/api/v1/carga-semanal/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carga-semanal'] })
    },
  })
}
