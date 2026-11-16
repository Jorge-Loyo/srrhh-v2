import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DesignarConcursoRequest } from '@srrhh/types'
import type * as Cph from '@/modules/concursos-cph/hooks/useConcursosCph'
import { apiClient } from '@/shared/lib/api-client'

// Hooks del wizard CEETPS, con los MISMOS nombres y tipos que los de
// concursos-cph/hooks/useConcursosCph: el wizard CEETPS es una copia del de CPH
// y los importa de acá en lugar de allá. Lo que CEETPS ya tiene en el backend
// (designar) está conectado; el resto (sorteo de jurado, inscriptos, orden de
// mérito, desierto, suspender) todavía no existe para CEETPS: las consultas
// quedan vacías y las acciones avisan que no están disponibles. Se conectan a
// medida que se adapta cada etapa.

export const CEETPS_WIZARD_KEY = 'concurso-ceetps-wizard'

const MENSAJE_NO_DISPONIBLE = 'Esta acción todavía no está disponible para concursos CEETPS.'

// Error con la forma de un error de axios, para que los onError del wizard
// (que leen response.data.message) muestren el aviso.
function noDisponible(): Promise<never> {
  const err = Object.assign(new Error(MENSAJE_NO_DISPONIBLE), {
    response: { data: { message: MENSAJE_NO_DISPONIBLE, error: { message: MENSAJE_NO_DISPONIBLE } } },
  })
  return Promise.reject(err)
}

function useAccionNoDisponible<T>(): T {
  return useMutation({ mutationFn: noDisponible }) as unknown as T
}

function useConsultaVacia<T>(nombre: string, id?: string): T {
  return useQuery({ queryKey: ['ceetps-wizard-sin-datos', nombre, id], queryFn: () => null, enabled: false }) as unknown as T
}

// ── Conectado al backend CEETPS ──────────────────────────────────────────────

export function useDesignarConcursoCph(id: string): ReturnType<typeof Cph.useDesignarConcursoCph> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: DesignarConcursoRequest) => {
      const res = await apiClient.post(`/api/v1/concursos-ceetps/${id}/designar`, {
        personaId: body.personaId,
        fechaDesde: body.fechaDesde,
        ...(body.idSialRol ? { idSialRol: body.idSialRol } : {}),
      })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CEETPS_WIZARD_KEY, id] })
      queryClient.invalidateQueries({ queryKey: ['concursos-ceetps'], exact: false })
    },
  }) as unknown as ReturnType<typeof Cph.useDesignarConcursoCph>
}

// ── Consultas sin equivalente CEETPS todavía ─────────────────────────────────

export const useJuradoCph = (id: string | undefined) =>
  useConsultaVacia<ReturnType<typeof Cph.useJuradoCph>>('jurado', id)
export const useJuradosVigentes = () =>
  useConsultaVacia<ReturnType<typeof Cph.useJuradosVigentes>>('jurados-vigentes')
export const useInscriptosCph = (id: string | undefined) =>
  useConsultaVacia<ReturnType<typeof Cph.useInscriptosCph>>('inscriptos', id)
export const useDesignacionEstado = (id: string | undefined, _enabled = true) =>
  useConsultaVacia<ReturnType<typeof Cph.useDesignacionEstado>>('designacion-estado', id)

// ── Acciones sin equivalente CEETPS todavía ──────────────────────────────────

export const useAsignarDesignadoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useAsignarDesignadoCph>>()
export const useDeclararDesiertoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useDeclararDesiertoCph>>()
export const useSuspenderConcursoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useSuspenderConcursoCph>>()
export const useGenerarSorteoJurado = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useGenerarSorteoJurado>>()
export const useReutilizarJurado = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useReutilizarJurado>>()
export const useConfirmarSorteoJurado = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useConfirmarSorteoJurado>>()
export const useCancelarSorteoJurado = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useCancelarSorteoJurado>>()
export const useRevertirConfirmacionSorteo = (_id: string) =>
  useAccionNoDisponible<ReturnType<typeof Cph.useRevertirConfirmacionSorteo>>()
export const useCrearInscriptoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useCrearInscriptoCph>>()
export const useActualizarInscriptoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useActualizarInscriptoCph>>()
export const useImportarInscriptosCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useImportarInscriptosCph>>()
export const useCerrarInscripcionCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useCerrarInscripcionCph>>()
export const useReabrirInscripcionCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useReabrirInscripcionCph>>()
export const usePublicarExamenCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.usePublicarExamenCph>>()
export const useDespublicarExamenCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useDespublicarExamenCph>>()
export const useConfirmarPresentadosCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useConfirmarPresentadosCph>>()
export const useRevertirPresentadosCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useRevertirPresentadosCph>>()
export const useConfirmarOrdenMeritoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useConfirmarOrdenMeritoCph>>()
export const useRevertirOrdenMeritoCph = (_id: string) => useAccionNoDisponible<ReturnType<typeof Cph.useRevertirOrdenMeritoCph>>()
