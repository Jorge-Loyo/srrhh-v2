// Estos hooks se mudaron desde `modules/kpis/hooks/useKpis.ts` (Opción A del
// plan): alimentan la sección "Evolución de dotación" que ahora vive en
// Reportes. Eran de uso exclusivo de los componentes `EvolucionDotacionChart` y
// `EvolucionEspecialidadChart`, así que se traen acá junto con sus dos helpers
// privados (`filtrosToParams`, `filtrosKey`) sin tocar su implementación. Los
// hooks que siguen usándose en el Tablero de KPIs (`useKpiDotacion`,
// `useKpiConcursos`, `useKpiAlertas`, `useKpiBajas`) quedan en `useKpis.ts`.
import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  KpiDotacionHistorica,
  KpiDotacionEvolucionOpciones,
  KpiDotacionEvolucion,
  FiltrosDotacionEvolucion,
} from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'

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

// Serializa los filtros multivaluados a querystring: un parámetro repetido por
// cada valor (?siglas=A&siglas=B), que es lo que el backend espera.
function filtrosToParams(f: FiltrosDotacionEvolucion): URLSearchParams {
  const sp = new URLSearchParams()
  for (const s of f.siglas ?? []) sp.append('siglas', s)
  for (const c of f.carreras ?? []) sp.append('carreras', c)
  for (const p of f.puestos ?? []) sp.append('puestos', p)
  for (const e of f.especialidades ?? []) sp.append('especialidades', e)
  for (const g of f.gruposEspecialidad ?? []) sp.append('gruposEspecialidad', g)
  if (f.jefatura && f.jefatura !== 'todos') sp.set('jefatura', f.jefatura)
  if (f.mesDesde) sp.set('mesDesde', f.mesDesde)
  if (f.mesHasta) sp.set('mesHasta', f.mesHasta)
  // Uniones (OR): JSON array de grupos, sin labels ni dimensiones vacías.
  if (f.grupos?.length) {
    const limpios = f.grupos.map((g) => {
      const o: Record<string, string[]> = {}
      if (g.siglas?.length) o.siglas = g.siglas
      if (g.carreras?.length) o.carreras = g.carreras
      if (g.puestos?.length) o.puestos = g.puestos
      if (g.especialidades?.length) o.especialidades = g.especialidades
      if (g.gruposEspecialidad?.length) o.gruposEspecialidad = g.gruposEspecialidad
      return o
    })
    sp.set('grupos', JSON.stringify(limpios))
  }
  return sp
}

// Clave estable para el cache de react-query (arrays ordenados).
function filtrosKey(f: FiltrosDotacionEvolucion) {
  return [
    [...(f.siglas ?? [])].sort(),
    [...(f.carreras ?? [])].sort(),
    [...(f.puestos ?? [])].sort(),
    [...(f.especialidades ?? [])].sort(),
    [...(f.gruposEspecialidad ?? [])].sort(),
    f.jefatura ?? 'todos',
    f.mesDesde ?? '',
    f.mesHasta ?? '',
    JSON.stringify(f.grupos ?? []),
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
      (filtros.especialidades?.length ?? 0) +
      (filtros.gruposEspecialidad?.length ?? 0) +
      (filtros.grupos?.length ?? 0) >
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
