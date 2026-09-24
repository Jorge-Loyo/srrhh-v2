import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  KpiDotacion,
  KpiConcursos,
  KpiAlertas,
  KpiDotacionHistorica,
  KpiBajas,
  KpiDotacionEvolucionOpciones,
  KpiDotacionEvolucion,
  FiltrosDotacionEvolucion,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

// S6-2: KpisPage consume estos dos endpoints (S6-1/S6-3 de Jorge) para
// armar el tablero. staleTime de 60s — son agregados sobre miles de filas,
// no hace falta refetchear en cada foco de ventana como sí pasa con los
// listados paginados (padrón/personas/cargos).
export function useKpiDotacion(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'dotacion', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiDotacion }>('/api/v1/kpis/dotacion', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useKpiConcursos(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'concursos', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiConcursos }>('/api/v1/kpis/concursos', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useKpiDotacionHistorica(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'dotacion-historica', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiDotacionHistorica }>('/api/v1/kpis/dotacion-historica', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

// S6-6: concursos vencidos + bajas sin concurso.
export function useKpiAlertas(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'alertas', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiAlertas }>('/api/v1/kpis/alertas', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useKpiBajas(hospitalId?: string) {
  return useQuery({
    queryKey: ['kpis', 'bajas', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiBajas }>('/api/v1/kpis/bajas', {
        params: { ...(hospitalId && { hospitalId }) },
      })
      return res.data.data
    },
    staleTime: 60_000,
  })
}

// Serializa los filtros multivaluados a querystring: un parámetro repetido por
// cada valor (?siglas=A&siglas=B), que es lo que el backend espera.
function filtrosToParams(f: FiltrosDotacionEvolucion): URLSearchParams {
  const sp = new URLSearchParams()
  for (const s of f.siglas ?? []) sp.append('siglas', s)
  for (const c of f.carreras ?? []) sp.append('carreras', c)
  for (const p of f.puestos ?? []) sp.append('puestos', p)
  for (const e of f.especialidades ?? []) sp.append('especialidades', e)
  if (f.jefatura && f.jefatura !== 'todos') sp.set('jefatura', f.jefatura)
  if (f.mesDesde) sp.set('mesDesde', f.mesDesde)
  if (f.mesHasta) sp.set('mesHasta', f.mesHasta)
  return sp
}

// Clave estable para el cache de react-query (arrays ordenados).
function filtrosKey(f: FiltrosDotacionEvolucion) {
  return [
    [...(f.siglas ?? [])].sort(),
    [...(f.carreras ?? [])].sort(),
    [...(f.puestos ?? [])].sort(),
    [...(f.especialidades ?? [])].sort(),
    f.jefatura ?? 'todos',
    f.mesDesde ?? '',
    f.mesHasta ?? '',
  ]
}

// Opciones FACETADAS: dependen de los filtros ya elegidos, por eso reciben los
// filtros y se refetchean al cambiarlos. Cada dimensión devuelve las opciones
// válidas dado el resto de la selección.
export function useDotacionEvolucionOpciones(filtros: FiltrosDotacionEvolucion) {
  return useQuery({
    queryKey: ['kpis', 'dotacion-evolucion', 'opciones', ...filtrosKey(filtros)],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiDotacionEvolucionOpciones }>(
        '/api/v1/kpis/dotacion-evolucion/opciones',
        { params: filtrosToParams(filtros) }
      )
      return res.data.data
    },
    staleTime: 60_000,
  })
}

// Descarga el Excel con el detalle que respalda el gráfico (mismos filtros).
export function useExportDotacionEvolucion() {
  return useMutation({
    mutationFn: async (filtros: FiltrosDotacionEvolucion) => {
      const res = await apiClient.get('/api/v1/kpis/dotacion-evolucion/export', {
        params: filtrosToParams(filtros),
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dotacion_${filtros.mesHasta ?? 'actual'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    },
  })
}

// Serie mensual de stock (una sola línea = suma de todo lo seleccionado). Solo
// consulta cuando hay al menos un filtro de dimensión elegido.
export function useDotacionEvolucion(filtros: FiltrosDotacionEvolucion) {
  const haySeleccion =
    (filtros.siglas?.length ?? 0) +
      (filtros.carreras?.length ?? 0) +
      (filtros.puestos?.length ?? 0) +
      (filtros.especialidades?.length ?? 0) >
    0
  return useQuery({
    queryKey: ['kpis', 'dotacion-evolucion', 'serie', ...filtrosKey(filtros)],
    queryFn: async () => {
      const res = await apiClient.get<{ data: KpiDotacionEvolucion }>('/api/v1/kpis/dotacion-evolucion', {
        params: filtrosToParams(filtros),
      })
      return res.data.data
    },
    enabled: haySeleccion,
    staleTime: 60_000,
  })
}
