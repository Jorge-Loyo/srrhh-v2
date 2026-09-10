import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

// Tipos de fila — no viven en @srrhh/types a propósito: son específicos de esta
// página de administración (mismo criterio que useAltasCargos en useCatalogos.ts,
// que también define su shape localmente en vez de compartirlo).
export interface RefAgrupador { id: string; cruce: string; escalafon: string; litPuesto: string; agrupador: string; activo: boolean }
export interface RefUnificadorPuesto { id: string; cruce: string; litCodReg: string; litPuesto: string; unificador: string; activo: boolean }
export interface RefEspecialidadCuil { id: string; tipo: string; cuil: string; cuilYRol: string | null; especialidad: string; activo: boolean }
export interface RefAbreviaturaTecnica { id: string; sigla: string; activo: boolean }
export interface RefAbreviaturaTitulo { id: string; titulo: string; activo: boolean }
export interface RefCorreccionLitPuesto { id: string; codReg: string | null; original: string; correccion: string; activo: boolean }
export interface RefCorreccionEspecialidad { id: string; original: string; correccion: string; activo: boolean }
export interface RefEspecialidadPorPuesto { id: string; agrupador: string; especialidad: string; purezaPct: number | null; activo: boolean }
export interface RefConectorMinuscula { id: string; conector: string; activo: boolean }
export interface RefSufijoOrdinal { id: string; sufijo: string; activo: boolean }

export interface RefListResult<TRow> {
  rows: TRow[]
  total: number
  page: number
  limit: number
}

export interface RefListParams {
  page?: number
  limit?: number
  search?: string
}

// Factory: cada tabla instancia esto una sola vez, con su propio tipo de fila y
// su propio endpoint — no hay resolución de tabla por string en runtime, cada
// recurso queda fijo en el código (ver referencias.routes.ts en la API, mismo
// criterio: endpoints tipados por tabla, no un único endpoint genérico).
function crearHooksReferencia<TRow, TBody extends object>(resource: string) {
  const queryKey = ['referencias', resource]

  function useList(params: RefListParams = {}) {
    return useQuery({
      queryKey: [...queryKey, params],
      queryFn: async () => {
        const res = await apiClient.get<{ data: RefListResult<TRow> }>(
          `/api/v1/referencias/${resource}`,
          { params }
        )
        return res.data.data
      },
    })
  }

  function useCreate() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: async (body: TBody) => {
        const res = await apiClient.post<{ data: TRow }>(`/api/v1/referencias/${resource}`, body)
        return res.data.data
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    })
  }

  function useUpdate() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: async ({ id, body }: { id: string; body: Partial<TBody> }) => {
        const res = await apiClient.patch<{ data: TRow }>(`/api/v1/referencias/${resource}/${id}`, body)
        return res.data.data
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    })
  }

  function useDelete() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: async (id: string) => {
        await apiClient.delete(`/api/v1/referencias/${resource}/${id}`)
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    })
  }

  return { useList, useCreate, useUpdate, useDelete }
}

export interface AgrupadorBody { cruce: string; escalafon: string; litPuesto: string; agrupador: string; activo?: boolean }
export interface UnificadorPuestoBody { cruce: string; litCodReg: string; litPuesto: string; unificador: string; activo?: boolean }
export interface EspecialidadCuilBody { tipo: string; cuil: string; cuilYRol?: string; especialidad: string; activo?: boolean }
export interface AbreviaturaTecnicaBody { sigla: string; activo?: boolean }
export interface AbreviaturaTituloBody { titulo: string; activo?: boolean }
export interface CorreccionLitPuestoBody { codReg?: string; original: string; correccion: string; activo?: boolean }
export interface CorreccionEspecialidadBody { original: string; correccion: string; activo?: boolean }
export interface EspecialidadPorPuestoBody { agrupador: string; especialidad: string; purezaPct?: number; activo?: boolean }
export interface ConectorMinusculaBody { conector: string; activo?: boolean }
export interface SufijoOrdinalBody { sufijo: string; activo?: boolean }

export const agrupadoresHooks = crearHooksReferencia<RefAgrupador, AgrupadorBody>('agrupadores')
export const unificadoresPuestoHooks = crearHooksReferencia<RefUnificadorPuesto, UnificadorPuestoBody>('unificadores-puesto')
export const especialidadesCuilHooks = crearHooksReferencia<RefEspecialidadCuil, EspecialidadCuilBody>('especialidades-cuil')
export const abreviaturasTecnicasHooks = crearHooksReferencia<RefAbreviaturaTecnica, AbreviaturaTecnicaBody>('abreviaturas-tecnicas')
export const abreviaturasTituloHooks = crearHooksReferencia<RefAbreviaturaTitulo, AbreviaturaTituloBody>('abreviaturas-titulo')
export const correccionesLitPuestoHooks = crearHooksReferencia<RefCorreccionLitPuesto, CorreccionLitPuestoBody>('correcciones-lit-puesto')
export const correccionesEspecialidadHooks = crearHooksReferencia<RefCorreccionEspecialidad, CorreccionEspecialidadBody>('correcciones-especialidad')
export const especialidadPorPuestoHooks = crearHooksReferencia<RefEspecialidadPorPuesto, EspecialidadPorPuestoBody>('especialidad-por-puesto')
export const conectoresMinusculaHooks = crearHooksReferencia<RefConectorMinuscula, ConectorMinusculaBody>('conectores-minuscula')
export const sufijosOrdinalesHooks = crearHooksReferencia<RefSufijoOrdinal, SufijoOrdinalBody>('sufijos-ordinales')
